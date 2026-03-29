import { cookies } from "next/headers";

import { AdminShell } from "@/components/admin-shell";
import { AdminMarkdownEditor } from "@/components/admin-markdown-editor";
import {
  ADMIN_NOTICE_COOKIE_NAME,
  isAdminNoticeSessionValid,
  readNoticeMarkdown,
} from "@/lib/notice-board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const isAuthenticated = isAdminNoticeSessionValid(
    cookieStore.get(ADMIN_NOTICE_COOKIE_NAME)?.value
  );
  const markdown = isAuthenticated ? await readNoticeMarkdown() : "";

  return (
    <AdminShell>
      <AdminMarkdownEditor
        initialAuthenticated={isAuthenticated}
        initialMarkdown={markdown}
      />
    </AdminShell>
  );
}
