import { createReadStream } from 'node:fs'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

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
