import React from "react";
import { useDataset, useProjectId, type FileInputProps } from "sanity";

/**
 * The usual upload field for a Reel, with the film itself playing underneath.
 *
 * Sanity shows an uploaded file as its name only, so approving a Reel meant
 * downloading it first. A stored file's id is its address on Sanity's CDN
 * ("file-<hash>-mp4" lives at /files/<project>/<dataset>/<hash>.mp4), so the
 * player needs nothing but the reference already in the document.
 */
export function videoUrlOf(ref: string | undefined, projectId: string, dataset: string): string | null {
  const match = /^file-([a-f0-9]+)-([a-z0-9]+)$/.exec(ref ?? "");
  if (!match) return null;
  return `https://cdn.sanity.io/files/${projectId}/${dataset}/${match[1]}.${match[2]}`;
}

export function VideoPreviewInput(props: FileInputProps) {
  const projectId = useProjectId();
  const dataset = useDataset();
  const src = videoUrlOf(props.value?.asset?._ref, projectId, dataset);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {props.renderDefault(props)}
      {src && (
        <video
          key={src}
          src={src}
          controls
          playsInline
          preload="metadata"
          style={{ width: "100%", maxWidth: 320, aspectRatio: "9 / 16", borderRadius: 12, background: "#000" }}
        />
      )}
    </div>
  );
}
