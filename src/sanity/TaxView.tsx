import type { CSSProperties } from "react";
import { formatPounds, type LedgerSummary, type Period } from "@/lib/ledger";
import {
  HOME_WORKING,
  KASSA_SINCE,
  MARRIAGE_ALLOWANCE,
  MILEAGE_RATE,
  MILEAGE_RATE_AFTER,
  TRADING_ALLOWANCE,
  VAT_THRESHOLD,
  billDates,
  estimateTax,
  longDay,
  mtdStepFor,
  ratesFor,
  upcomingTaxDates,
} from "@/lib/selfAssessment";

/**
 * «Налоги» under the tax-year totals in «Касса»: the bill if the year ended
 * today, the lines that change what she owes, and the dates HMRC holds her to.
 *
 * Browser code like the rest of the pane: it reads only the totals the pane
 * already has, and the rules in @/lib/selfAssessment.
 */

const LINE = "1px solid rgba(128,128,128,0.25)";
const WARN = "#b9770e";
const muted: CSSProperties = { opacity: 0.7 };
const small: CSSProperties = { fontSize: 13, margin: 0, lineHeight: 1.5 };

export type RollingTurnover = { state: "loading" } | { state: "failed" } | { state: "ready"; income: number };

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ border: LINE, borderRadius: 8, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", ...muted }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {hint && <div style={{ fontSize: 12, marginTop: 2, ...muted }}>{hint}</div>}
    </div>
  );
}

/** One line to watch: how far along the year is towards it, and what happens past it. */
export function Threshold({ title, now, limit, past }: { title: string; now: number | null; limit: number; past: string }) {
  const share = now === null ? 0 : Math.min(1, Math.max(0, now / limit));
  const crossed = now !== null && now > limit;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
        <span>{title}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", ...muted }}>
          {now === null ? "…" : formatPounds(now)} из {formatPounds(limit)}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(128,128,128,0.18)", overflow: "hidden" }}>
        <div
          style={{ width: `${Math.round(share * 100)}%`, height: "100%", background: crossed ? WARN : "currentColor", opacity: crossed ? 1 : 0.55 }}
        />
      </div>
      <span style={{ fontSize: 12, color: crossed ? WARN : undefined, ...(crossed ? {} : muted) }}>
        {crossed ? `Пройдено: ${past}` : `Дальше: ${past}`}
      </span>
    </div>
  );
}

export function TaxView({
  period,
  summary,
  rolling,
  today,
}: {
  period: Period;
  summary: LedgerSummary;
  rolling: RollingTurnover;
  today: string;
}) {
  const label = period.title.replace("Налоговый год ", "");
  const { rates, assumed } = ratesFor(label);
  const tax = estimateTax(summary.income, summary.expense, rates);
  const dates = billDates({ from: period.from, to: period.to, label });
  const running = today >= period.from && today <= period.to;
  const mtd = mtdStepFor(label);
  const upcoming = upcomingTaxDates(today);

  return (
    <section style={{ border: LINE, borderRadius: 8, padding: 16, display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Налоги за {label} — прикидка</h2>
        <p style={{ ...small, ...muted }}>
          {running ? "Если бы год закончился сегодня. " : ""}Для Англии, когда других доходов нет. Считается из кассы: что
          не записано, сюда не попало.
        </p>
      </div>

      {period.from < KASSA_SINCE && (
        <p style={{ ...small, color: WARN }}>
          Касса ведётся со {longDay(KASSA_SINCE).replace(" г.", "")}. Оплаты и расходы с{" "}
          {longDay(period.from).replace(" г.", "")} до этого дня внесите задним числом — иначе прикидка меньше настоящей.
        </p>
      )}
      {assumed && (
        <p style={{ ...small, color: WARN }}>
          Ставок на {label} в кассе пока нет — посчитано по {rates.label}. Сообщите Сафару, чтобы обновил.
        </p>
      )}

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Figure label="Прибыль" value={formatPounds(tax.profit)} hint="облагается налогом" />
        <Figure label="Налог за год" value={formatPounds(tax.total)} hint="столько отложить" />
        <Figure label="С нового £1" value={`${tax.marginalPence}p`} hint="уйдёт в налог" />
      </div>

      <p style={small}>
        Пришло {formatPounds(tax.turnover)} −{" "}
        {tax.usesTradingAllowance
          ? `${formatPounds(tax.deduction)} без чеков (расходов меньше £1 000, поэтому вычитается £1 000)`
          : `расходы ${formatPounds(tax.deduction)}`}{" "}
        = прибыль {formatPounds(tax.profit)}. Из неё {formatPounds(Math.min(tax.profit, tax.allowance))} без налога; подоходный
        налог {formatPounds(tax.incomeTax)} и National Insurance {formatPounds(tax.nationalInsurance)}.
      </p>

      {tax.noReturnNeeded ? (
        <p style={small}>
          ✓ Пришло не больше £1 000 — за этот год декларация не нужна (если у Кристины уже есть UTR, HMRC может всё равно
          попросить её подать — тогда подать с нулём).
        </p>
      ) : tax.total === 0 ? (
        <p style={small}>✓ Налог 0, но декларацию до {longDay(dates.balance)} подать всё равно нужно.</p>
      ) : tax.paymentOnAccount > 0 ? (
        <p style={small}>
          Налог больше £1 000, поэтому HMRC попросит авансы на следующий год. Платить: до {longDay(dates.balance)} —{" "}
          <strong>{formatPounds(tax.total + tax.paymentOnAccount)}</strong> (налог {formatPounds(tax.total)} + первый аванс{" "}
          {formatPounds(tax.paymentOnAccount)}), до {longDay(dates.secondAdvance)} — ещё {formatPounds(tax.paymentOnAccount)}.
          Авансы засчитываются в налог следующего года; если тот окажется меньше, вернут.
        </p>
      ) : (
        <p style={small}>
          Заплатить {formatPounds(tax.total)} до {longDay(dates.balance)}, вместе с декларацией. Налог меньше £1 000 — авансов
          не будет.
        </p>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Пороги</h3>
        <Threshold title="Выручка за год" now={tax.turnover} limit={TRADING_ALLOWANCE} past="нужна декларация" />
        <Threshold title="Прибыль за год" now={tax.profit} limit={rates.personalAllowance} past="с каждого фунта 26p налога" />
        <Threshold title="Прибыль за год" now={tax.profit} limit={rates.class4Upper} past="ставка 42p с фунта — пора к бухгалтеру" />
        <Threshold
          title="Выручка за год (Making Tax Digital)"
          now={tax.turnover}
          limit={mtd.threshold}
          past={`с ${mtd.starts} отчёты в HMRC каждый квартал через программу`}
        />
        <Threshold
          title="Выручка за последние 12 месяцев (VAT)"
          now={rolling.state === "ready" ? rolling.income : null}
          limit={VAT_THRESHOLD}
          past="за 30 дней зарегистрироваться на VAT, +20% к ценам — заранее к бухгалтеру"
        />
        {rolling.state === "failed" && <p style={{ ...small, ...muted }}>Не удалось посчитать последние 12 месяцев.</p>}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Ближайшие даты</h3>
        {upcoming.map((date) => (
          <div key={date.day} style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 12, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>
              {longDay(date.day).replace(" г.", "")}
              <span style={{ display: "block", fontWeight: 400, ...muted }}>
                {date.inDays === 0 ? "сегодня" : `через ${date.inDays} дн.`}
              </span>
            </span>
            <span style={{ lineHeight: 1.5 }}>{date.title}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Как законно платить меньше</h3>
        <ul style={{ ...small, paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>
            Поездки на своей машине за вещами и с вещами — «Мили на своей машине»: {MILEAGE_RATE}p за милю (после 10 000 миль
            за год — {MILEAGE_RATE_AFTER}p). Бензин и ремонт тогда отдельно не пишутся.
          </li>
          <li>
            Работа дома — «Работа из дома», раз в месяц:{" "}
            {HOME_WORKING.map((step) => `${formatPounds(step.amount).replace(".00", "")} за ${step.hours}`).join(", ")}.
          </li>
          <li>Комиссии Stripe и Etsy касса сама не видит — раз в месяц переписать из выписки в «Комиссии».</li>
          <li>Машинки, оверлок, манекен, утюг — «Оборудование», вычитаются целиком в год покупки.</li>
          {tax.profit < rates.personalAllowance && (
            <li>
              Прибыль меньше {formatPounds(rates.personalAllowance).replace(".00", "")}: можно передать Сафару{" "}
              {formatPounds(MARRIAGE_ALLOWANCE).replace(".00", "")} необлагаемой суммы (Marriage Allowance) — около £252 в год,
              если он платит налог по ставке 20%.
            </li>
          )}
          {tax.profit < rates.smallProfits && !tax.noReturnNeeded && (
            <li>
              Прибыль меньше {formatPounds(rates.smallProfits).replace(".00", "")}: год не засчитается в государственную пенсию,
              если не заплатить добровольно Class 2 — {formatPounds(rates.class2Weekly)} в неделю, около{" "}
              {formatPounds(rates.class2Weekly * 52).replace(/\.\d\d$/, "")} в год. Галочка в декларации.
            </li>
          )}
        </ul>
      </div>

      <p style={{ ...small, ...muted }}>
        Это прикидка по ставкам {rates.label}, не декларация. Цифры для декларации — из «Скачать таблицу» за налоговый год.
      </p>
    </section>
  );
}
