import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * «Как подключить Pinterest» — what Kristina does on Pinterest's side so the
 * site can post Pins by itself, step by step, with every word to paste.
 *
 * Pinterest gives a new app "Trial" access first, and Pins an app makes on
 * Trial are visible only to their creator. Public posting needs "Standard"
 * access, which Pinterest grants after watching a short recording of the app
 * connecting and making a Pin — so it goes in three stages, and until the
 * third the Pins in «Пины — готовы» go up by hand (the last section).
 */

export const PINTEREST_APP = {
  name: "Beautasy Studio",
  company: "Beautasy",
  website: "https://www.beautasy.co.uk",
  privacy: "https://www.beautasy.co.uk/pages/privacy-policy",
  redirect: "https://www.beautasy.co.uk/api/pinterest/callback",
  description:
    "Beautasy is a small dressmaking and alterations atelier in Southampton, UK, run by one maker. " +
    "Beautasy Studio is our private content manager: the owner prepares Pins from photos and videos of her own work " +
    "(alterations, curtains, handmade accessories), reviews each one, and publishes it to her own Pinterest business account " +
    "with a link back to that piece on beautasy.co.uk. Only the account owner uses the app; it reads her boards to choose " +
    "where a Pin goes and creates Pins on them. No data from other Pinterest users is collected or stored.",
};

const page: CSSProperties = { padding: "20px 24px 48px", maxWidth: 720, lineHeight: 1.5, fontSize: 15 };
const card: CSSProperties = { border: "1px solid rgba(128,128,128,0.25)", borderRadius: 10, padding: "14px 18px", margin: "14px 0" };
const muted: CSSProperties = { opacity: 0.7, fontSize: 13 };
const code: CSSProperties = {
  display: "block",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  background: "rgba(128,128,128,0.12)",
  borderRadius: 6,
  padding: "8px 10px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13,
};

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div style={{ margin: "6px 0 10px" }}>
      <span style={code}>{text}</span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
        style={{ marginTop: 6, padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(128,128,128,0.4)", background: "transparent", cursor: "pointer", font: "inherit", fontSize: 13 }}
      >
        {done ? "Скопировано ✓" : "Скопировать"}
      </button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, margin: "14px 0" }}>
      <div
        style={{ flex: "0 0 28px", height: 28, borderRadius: 14, background: "#5c294d", color: "#fff", display: "grid", placeItems: "center", fontWeight: 600 }}
      >
        {n}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
);

export function PinterestGuidePane() {
  return (
    <div style={page}>
      <h2 style={{ margin: "0 0 6px" }}>Как подключить Pinterest</h2>
      <p style={muted}>
        Когда всё будет готово, пины из «Соцсети» → «Пины — готовы» будут уходить в Pinterest сами — как посты в Instagram. Это три этапа; пока они
        идут, пины выкладываются руками (последний раздел внизу).
      </p>

      <div style={card}>
        <h3 style={{ margin: "4px 0" }}>Этап 1 · Заявка — 15 минут</h3>
        <Step n={1} title="Войдите в Pinterest Beautasy">
          Откройте <A href="https://www.pinterest.com">pinterest.com</A> и войдите в аккаунт Beautasy — тот, к которому привязан сайт
          beautasy.co.uk. Проверка: <b>Settings → Claimed accounts</b> — там должен быть beautasy.co.uk. Если аккаунт личный, а не бизнес:{" "}
          <b>Settings → Account management → Convert to a business account</b>.
        </Step>
        <Step n={2} title="Откройте кабинет разработчика">
          Перейдите на <A href="https://developers.pinterest.com/apps/">developers.pinterest.com/apps</A>. Вверху справа <b>Log in</b> — тем же
          аккаунтом. Откроется страница <b>My apps</b>.
        </Step>
        <Step n={3} title="Нажмите «Connect app» и заполните форму">
          Если Pinterest попросит согласиться с условиями для разработчиков — прочитайте и примите их сами. Поля:
          <div style={{ marginTop: 8 }}>
            <div>App name</div>
            <Copy text={PINTEREST_APP.name} />
            <div>Company name</div>
            <Copy text={PINTEREST_APP.company} />
            <div>Company website / App website</div>
            <Copy text={PINTEREST_APP.website} />
            <div>Privacy policy URL</div>
            <Copy text={PINTEREST_APP.privacy} />
            <div>App description / Use case — вставьте целиком</div>
            <Copy text={PINTEREST_APP.description} />
            <div style={muted}>
              Если спрашивают тип приложения или цель — выберите то, что ближе к «publishing Pins / content management for my own
              business account».
            </div>
          </div>
        </Step>
        <Step n={4} title="Отправьте заявку и ждите письма">
          <b>Submit</b>. Pinterest проверяет вручную — обычно несколько дней. Придёт письмо, что у приложения <b>Trial access</b>. Если
          откажут — чаще всего из-за ссылки на Privacy policy или слишком короткого описания: пришлите письмо Сафару.
        </Step>
      </div>

      <div style={card}>
        <h3 style={{ margin: "4px 0" }}>Этап 2 · После письма — 5 минут</h3>
        <Step n={5} title="Добавьте адрес возврата">
          <b>My apps</b> → карточка <b>Beautasy Studio</b> → раздел <b>Redirect URIs</b> → вставьте и сохраните (<b>Save</b>):
          <Copy text={PINTEREST_APP.redirect} />
        </Step>
        <Step n={6} title="Отправьте Сафару два ключа — лично">
          На той же странице: <b>App ID</b> и <b>App secret key</b> (нажмите <b>Show</b>). Секретный ключ — как пароль: только Сафару в личные
          сообщения, не в группу и не в Studio. Сафар внесёт их на сайт (Vercel: <code>PINTEREST_APP_ID</code>,{" "}
          <code>PINTEREST_APP_SECRET</code>).
        </Step>
      </div>

      <div style={card}>
        <h3 style={{ margin: "4px 0" }}>Этап 3 · Открыть пины для всех</h3>
        <Step n={7} title="Кнопка «Подключить Pinterest» и короткое видео">
          На «пробном» доступе пины, которые делает сайт, видит только владелец аккаунта. Чтобы они стали видны всем, Pinterest хочет
          запись экрана: вход через Pinterest и создание одного пина. Кнопку подключения и запись делаем мы с Сафаром.
        </Step>
        <Step n={8} title="Upgrade">
          <b>My apps</b> → на карточке приложения <b>Upgrade</b> → проверить данные → загрузить видео → <b>Submit</b>. Pinterest отвечает
          обычно за одну-две недели.
        </Step>
      </div>

      <div style={card}>
        <h3 style={{ margin: "4px 0" }}>Пока — выкладываем руками</h3>
        <Step n={1} title="Скачайте картинки">
          «Соцсети» → «Пины — готовы» → откройте пин. У каждой картинки: меню <b>⋯</b> → <b>Download</b>. Порядок важен — 1, 2, 3…
        </Step>
        <Step n={2} title="Создайте пин">
          На <A href="https://www.pinterest.com/pin-creation-tool/">pinterest.com → Create → Pin</A> (или «+» в приложении) загрузите картинки.
          Если их несколько — выберите <b>Carousel</b>, не «Collage». Есть видео — можно выложить и его отдельным пином.
        </Step>
        <Step n={3} title="Вставьте слова">
          Title, Description, Link, Alt text и Board — скопируйте из полей пина. Доски нет — создайте с этим названием.
        </Step>
        <Step n={4} title="Отметьте «Выложен»">
          <b>Publish</b>, потом здесь, в пине: Статус → <b>Выложен</b> (и по желанию вставьте ссылку на пин). Он уйдёт в «Соцсети» → «Пины — выложены».
        </Step>
        <p style={muted}>Ритм: 1–3 пина в день лучше, чем десять за раз — Pinterest любит регулярность.</p>
      </div>
    </div>
  );
}
