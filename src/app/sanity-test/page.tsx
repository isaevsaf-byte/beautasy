import { sanityClient } from "@/lib/sanity";

export const dynamic = "force-dynamic";

export default async function SanityTestPage() {
  let connectionStatus = "unknown";
  let projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "NOT SET";
  let dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "NOT SET";
  let documentCount = 0;
  let errorMessage = "";
  let documentTypes: string[] = [];

  try {
    // Try fetching all document types to verify connection
    const result = await sanityClient.fetch<{ _type: string }[]>(
      `*[!(_type match "system.*")]{ _type }[0...50]`
    );
    connectionStatus = "connected";
    documentCount = result.length;
    documentTypes = [...new Set(result.map((doc) => doc._type))];
  } catch (err: unknown) {
    connectionStatus = "error";
    errorMessage = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-3xl shadow-lg p-8 border border-[#E6E6FA]/40">
        <h1 className="font-serif text-2xl mb-6 text-center">
          Sanity Connection Test
        </h1>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500">Status</span>
            <span
              className={`text-sm font-medium px-3 py-1 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-green-100 text-green-700"
                  : connectionStatus === "error"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {connectionStatus === "connected"
                ? "✅ Connected"
                : connectionStatus === "error"
                ? "❌ Error"
                : "⏳ Unknown"}
            </span>
          </div>

          {/* Project ID */}
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500">Project ID</span>
            <code className="text-sm bg-gray-50 px-2 py-1 rounded">
              {projectId}
            </code>
          </div>

          {/* Dataset */}
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500">Dataset</span>
            <code className="text-sm bg-gray-50 px-2 py-1 rounded">
              {dataset}
            </code>
          </div>

          {/* Document Count */}
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500">Documents Found</span>
            <span className="text-sm font-medium">{documentCount}</span>
          </div>

          {/* Document Types */}
          {documentTypes.length > 0 && (
            <div className="py-3 border-b border-gray-100">
              <span className="text-sm text-gray-500 block mb-2">
                Document Types
              </span>
              <div className="flex flex-wrap gap-2">
                {documentTypes.map((type) => (
                  <span
                    key={type}
                    className="text-xs bg-[#E6E6FA]/30 text-gray-700 px-2.5 py-1 rounded-full"
                  >
                    {type}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {errorMessage && (
            <div className="py-3 bg-red-50 rounded-xl px-4">
              <span className="text-sm text-red-600 block mb-1 font-medium">
                Error Details
              </span>
              <p className="text-xs text-red-500">{errorMessage}</p>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center mt-6">
          This is a temporary test page. Remove it after verifying the
          connection.
        </p>
      </div>
    </div>
  );
}
