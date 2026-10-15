import { PRIVACY_TEMPLATE_URL } from "@/lib/privacy-template";
import { privacyTemplateDocument, privacyDocumentResponse } from "@/server/privacy-document";

export async function GET(request: Request) {
  return privacyDocumentResponse(privacyTemplateDocument(), `${PRIVACY_TEMPLATE_URL}?format=pdf`,
    "gdpr.pdf", new URL(request.url).searchParams.get("format") === "pdf");
}
