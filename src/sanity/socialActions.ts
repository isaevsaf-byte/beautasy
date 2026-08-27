import { useDocumentOperation } from "sanity";
import type { DocumentActionComponent, DocumentActionProps } from "sanity";

/**
 * The two buttons on a social post.
 *
 * "Approve" is the only gate that matters — nothing reaches Instagram without
 * it — so it is one click, and it says what will happen next rather than
 * naming a status.
 */

interface PostDoc {
  _id?: string;
  status?: string;
  caption?: string;
  scheduledFor?: string;
  publishedAt?: string;
}

function publishedIdOf(id: string): string {
  return id.replace(/^drafts\./, "");
}

export const approvePostAction: DocumentActionComponent = (props: DocumentActionProps) => {
  // Sanity renders document actions as React components, so hooks are correct
  // here — the rule only fires because the convention names them `xAction`
  // rather than starting with a capital letter.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { patch, publish } = useDocumentOperation(props.id, props.type);
  const doc = (props.draft ?? props.published) as PostDoc | null;
  const isDraft = doc?.status === "draft" || doc?.status === "failed";
  const when = doc?.scheduledFor
    ? new Date(doc.scheduledFor).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
    : null;

  return {
    label: "Approve for posting",
    tone: "positive",
    disabled: !isDraft || !doc?.caption,
    title: !doc?.caption
      ? "Write a caption first."
      : !isDraft
      ? "This post has already been approved."
      : when
      ? `Marks it approved. It goes out on ${when}.`
      : "Marks it approved. It goes out at the next run, usually tomorrow morning.",
    onHandle: () => {
      // Publish as well as patch: the queue reads published documents, so an
      // approval left as a Studio draft would never go out.
      patch.execute([{ set: { status: "approved" } }]);
      publish.execute();
      props.onComplete();
    },
  };
};

export const publishNowAction: DocumentActionComponent = (props: DocumentActionProps) => {
  const published = props.published as PostDoc | null;
  const hasUnpublishedChanges = !!props.draft;
  const ready = published?.status === "approved" && !published?.publishedAt;

  return {
    label: hasUnpublishedChanges ? "Publish your edit first" : "Post to Instagram now",
    tone: "primary",
    disabled: hasUnpublishedChanges || !ready,
    title: hasUnpublishedChanges
      ? "Publish your change in the Studio first — the site reads the published version."
      : ready
      ? "Sends it to Instagram straight away, ignoring the date."
      : published?.publishedAt
      ? "This has already gone out."
      : "Approve it first.",
    onHandle: async () => {
      try {
        const res = await fetch("/api/social/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: publishedIdOf(props.id) }),
        });
        const data = await res.json();
        if (data?.skipped) {
          window.alert(`Not posted: ${data.skipped}`);
        } else if (data?.published > 0) {
          window.alert(
            data.posts?.[0]?.permalink
              ? `Posted. ${data.posts[0].permalink}`
              : "Posted to Instagram."
          );
        } else {
          window.alert(
            `Could not post it: ${data?.posts?.[0]?.error ?? "unknown problem"}`
          );
        }
      } catch {
        window.alert("Could not reach the site. The morning run will send it instead.");
      }
      props.onComplete();
    },
  };
};
