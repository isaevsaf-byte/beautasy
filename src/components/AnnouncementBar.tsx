import { getSiteSettings } from "@/lib/siteSettings";

const bgMap = {
  lavender: "bg-lavender text-charcoal",
  charcoal: "bg-[#4A4A4A] text-white",
  cream: "bg-cream-soft text-charcoal border-b border-lavender-soft/40",
};

export default async function AnnouncementBar() {
  const settings = await getSiteSettings();
  const bar = settings.announcementBar;

  if (!bar?.enabled || !bar.text) return null;

  const colorClass = bgMap[bar.bgColor ?? "lavender"];

  const inner = (
    <p className="text-xs sm:text-sm tracking-wide text-center py-2.5 px-4 font-medium">
      {bar.text}
    </p>
  );

  return (
    <div className={colorClass}>
      {bar.link ? (
        <a href={bar.link} className="block hover:opacity-80 transition-opacity">
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  );
}
