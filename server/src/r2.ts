import { createReadStream } from 'node:fs'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const REQUIRED_ENV = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL'] as const

function requireEnv(name: (typeof REQUIRED_ENV)[number]): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

let client: S3Client | null = null

/** R2 is S3-API compatible, so the regular AWS SDK works against Cloudflare's endpoint. */
function getClient(): S3Client {
  if (!client) {
    const accountId = requireEnv('R2_ACCOUNT_ID')
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      },
      // Without this the SDK addresses objects as `<bucket>.<accountid>.r2.cloudflarestorage.com`,
      // a subdomain R2 never creates — the browser's PUT just fails DNS resolution ("Failed to
      // fetch"). Path-style (`<accountid>.r2.cloudflarestorage.com/<bucket>/...`) is what R2 expects.
      forcePathStyle: true,
    })
  }
  return client
}

/** Uploads a local file to R2 and returns its public URL (bucket must have public access
 * or a custom domain configured — see R2_PUBLIC_BASE_URL). */
export async function uploadFile(localPath: string, key: string, contentType: string): Promise<string> {
  const bucket = requireEnv('R2_BUCKET')
  const publicBase = requireEnv('R2_PUBLIC_BASE_URL').replace(/\/$/, '')

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(localPath),
      ContentType: contentType,
    }),
  )

  return `${publicBase}/${key}`
}

/**
 * Returns a short-lived URL the browser can PUT the source video to directly — the file
 * never passes through this server, avoiding Cloud Run's request-size ceiling entirely.
 */
export async function getUploadUrl(
  key: string,
  contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const bucket = requireEnv('R2_BUCKET')
  const publicBase = requireEnv('R2_PUBLIC_BASE_URL').replace(/\/$/, '')

  const uploadUrl = await getSignedUrl(
    getClient(),
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: 3600 },
  )

  return { uploadUrl, publicUrl: `${publicBase}/${key}` }
}
