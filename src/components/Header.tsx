import { FilmSlate } from '@phosphor-icons/react'

export default function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
            <FilmSlate size={20} weight="bold" className="text-white" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight">Autocut</p>
            <p className="hidden text-xs text-muted-foreground sm:block">Cắt video dài thành clip ngắn chuẩn TikTok</p>
          </div>
        </div>
        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          Beta · Xử lý ngay trên trình duyệt
        </span>
      </div>
    </header>
  )
}
