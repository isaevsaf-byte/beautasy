import type { ValidationContext } from "sanity";
import { carriesLocation } from "@/lib/photoLocation";

/**
 * The Studio's refusal to publish a photo whose file says where it was taken —
 * see @/lib/photoLocation. Every picture uploaded here is public the moment it
 * lands, original file and all, and a phone photo taken in the workroom at
 * home carries that home's address. Used wherever Kristina uploads her own
 * photos: the gallery (workPiece.ts) and «Знакомьтесь, Кристина» in Site
 * Settings.
 *
 * Only publishing can be stopped: the file is already out there, so each
 * message also asks for Safar to delete it.
 */

export const PHOTO_LOCATION_PROBLEM =
  "В этом фото всё ещё записано место съёмки (GPS). Если снимали дома, это ваш домашний адрес, а исходный файл может скачать кто угодно. Уберите фото отсюда и положите его в папку Gallery для Сафара: импорт удалит место съёмки из файла. (И скажите Сафару, чтобы он удалил сам загруженный файл.)";

/** For her own photos in Site Settings, which don't go through the Gallery import */
export const PORTRAIT_LOCATION_PROBLEM =
  "В этом фото всё ещё записано место съёмки (GPS). Если снимали дома, это ваш домашний адрес, а исходный файл может скачать кто угодно. Уберите фото отсюда и загрузите копию без места съёмки: на iPhone «Поделиться» → «Параметры» вверху → выключите «Геопозиция», затем AirDrop на компьютер или «Сохранить в Файлы». Или отдайте фото Сафару. (И скажите Сафару, чтобы он удалил сам загруженный файл.)";

/** Answers per uploaded file: a file never changes, so neither does its answer */
const checked = new Map<string, Promise<boolean>>();

/**
 * Reads the first 256 KB of the original, where the metadata sits. If the
 * file can't be read the photo is let through: a check that fails closed
 * would stop Kristina publishing at all on a bad connection.
 */
function locatedOnUpload(value: unknown, context: ValidationContext): Promise<boolean> {
  const ref = (value as { asset?: { _ref?: string } } | undefined)?.asset?._ref;
  if (!ref) return Promise.resolve(false);
  let answer = checked.get(ref);
  if (!answer) {
    answer = (async () => {
      const url = await context.getClient({ apiVersion: "2026-02-13" }).fetch<string | null>(`*[_id == $ref][0].url`, { ref });
      if (!url) return false;
      const response = await fetch(url, { headers: { Range: "bytes=0-262143" } });
      if (!response.ok) return false;
      return carriesLocation(new Uint8Array(await response.arrayBuffer()));
    })().catch(() => false);
    checked.set(ref, answer);
  }
  return answer;
}

/** A rule that turns back a located photo with `problem`, in words for Kristina */
function locationRule(problem: string) {
  return async (value: unknown, context: ValidationContext): Promise<string | true> =>
    (await locatedOnUpload(value, context)) ? problem : true;
}

/** The gallery's photos, whose way out is the Gallery import */
export const photoLocationRule = locationRule(PHOTO_LOCATION_PROBLEM);

/** Her portrait and the photo at work in Site Settings */
export const portraitLocationRule = locationRule(PORTRAIT_LOCATION_PROBLEM);
