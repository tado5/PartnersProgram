import { getPublicPrivacyNotice } from "@/server/privacy";
import { privacyDocumentResponse, privacyDocumentHeaders } from "@/server/privacy-document";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const query = new URL(request.url).searchParams;
  const input = query.get("version");
  const version = input === null ? undefined : Number(input);
  if (!/^[a-z0-9-]{1,80}$/.test(slug) ||
      (version !== undefined && (!/^[1-9]\d{0,8}$/.test(input!) || !Number.isSafeInteger(version)))) return missing();
  const result = await getPublicPrivacyNotice(slug, version);
  if (!result) return missing();
  const { notice } = result;
  const downloadUrl = `/ochrana-udajov/${result.companySlug}?version=${notice.version}&format=pdf`;
  return privacyDocumentResponse({
    ...notice, companyName: result.companyName, template: false,
    versionLabel: `Verzia ${notice.version} · Publikované a účinné od ${notice.publishedAt}`,
  }, downloadUrl, `ochrana-udajov-${result.companySlug}-v${notice.version}.pdf`, query.get("format") === "pdf");
}

function missing() {
  return new Response("<!doctype html><html lang=\"sk\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Oznámenie sa nenašlo</title></head><body><h1>Oznámenie sa nenašlo</h1><p>Požadované oznámenie nie je dostupné.</p></body></html>", {
    status: 404, headers: { ...privacyDocumentHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}
