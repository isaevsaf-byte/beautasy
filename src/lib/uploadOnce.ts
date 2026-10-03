/**
 * Uploads each photo that has not been uploaded yet, and hands back every
 * photo's asset id in order.
 *
 * The review form used to upload all its photos on every press of "Send
 * review". When the review itself was refused — a comment over the limit, a
 * rating not picked — the customer fixed it and pressed again, and the same
 * photos went up a second time. Each try counted against the link's daily
 * allowance, so a third try could be turned away for a whole day. Now a photo
 * that already has an id keeps it, and only the rest are sent.
 *
 * `remember` is called as soon as each upload succeeds, so a try that fails
 * on its third photo keeps the first two for the next try. Plain functions in
 * and out, so the form's React state stays the form's business.
 */
export async function uploadOnce<Photo>(
  photos: readonly Photo[],
  idOf: (photo: Photo) => string | undefined,
  upload: (photo: Photo) => Promise<string>,
  remember: (photo: Photo, assetId: string) => void
): Promise<string[]> {
  const ids: string[] = [];
  for (const photo of photos) {
    let id = idOf(photo);
    if (!id) {
      id = await upload(photo);
      remember(photo, id);
    }
    ids.push(id);
  }
  return ids;
}
