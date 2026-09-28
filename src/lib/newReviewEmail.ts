import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/site";
import { topicLabel, type SiteReview } from "@/lib/siteReviews";

/** Kristina's note: the review as written, and the one button that shows it */
export function newReviewEmail(review: SiteReview, id: string, pieceName: string | null): string {
  const about = pieceName ?? topicLabel(review.topic) ?? "";
  const stars = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
  const studioLink = `${SITE_URL}/studio/intent/edit/id=${encodeURIComponent(id)};type=review`;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.06);">
    <div style="background:#e8dff5;padding:28px 36px;">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#7a6d9a;">New review on the site</p>
      <h1 style="margin:0;font-size:22px;font-weight:400;color:#2d2d2d;">
        <span style="color:#9b7fd4;letter-spacing:2px;">${stars}</span><br>from ${escapeHtml(review.name)}
      </h1>
    </div>
    <div style="padding:28px 36px;">
      ${about ? `<p style="margin:0 0 10px;color:#7a6d9a;font-size:13px;">About: ${escapeHtml(about)}</p>` : ""}
      <p style="margin:0 0 22px;padding:14px 18px;background:#faf8f5;border-radius:10px;color:#3d3d3d;line-height:1.7;white-space:pre-line;">${escapeHtml(review.comment)}</p>
      <p style="margin:0;color:#3d3d3d;line-height:1.7;">
        It isn't on the site yet. To show it, open it in the Studio, tick «Одобрен» and press «Опубликовать».
        If it isn't one to show, just leave it unticked.
      </p>
      <p style="text-align:center;margin:26px 0 0;">
        <a href="${studioLink}" style="display:inline-block;padding:13px 30px;background:#DCD0FF;color:#2d2d2d;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Open it in the Studio</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
