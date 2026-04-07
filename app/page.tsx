import { ExchangeStudio } from "@/components/exchange-studio";
import { HomeShell } from "@/components/home-shell";
import { MarkdownNoticeBoard } from "@/components/markdown-notice-board";
import { readNoticeMarkdown } from "@/lib/notice-board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const sourceMarkdown = await readNoticeMarkdown();

  return (
    <HomeShell
      noticeBoard={<MarkdownNoticeBoard sourceMarkdown={sourceMarkdown} />}
      studio={<ExchangeStudio />}
    />
  );
}
