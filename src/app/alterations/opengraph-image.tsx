import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
          background:
            "linear-gradient(135deg, #fdfbf7 0%, #efe9ff 45%, #e4d7ff 100%)",
          color: "#3f3a42",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            width: "fit-content",
            padding: "10px 18px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.7)",
            fontSize: 24,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Beautasy.co.uk
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 76, lineHeight: 1.08 }}>
            Alterations
            <br />
            in Southampton
          </div>
          <div
            style={{
              fontSize: 32,
              lineHeight: 1.3,
              color: "#5b5563",
              maxWidth: "90%",
            }}
          >
            Expert tailoring, repairs, and perfect-fit adjustments.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 24,
            color: "#5b5563",
          }}
        >
          <div>Book online today</div>
          <div>beautasy.co.uk/alterations</div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
