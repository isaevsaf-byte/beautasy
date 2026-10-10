import React from "react";
import { AbsoluteFill, Audio, CalculateMetadataFunction, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { CREAM, Caption, PLUM, Sewn, ease, serifItalic } from "../BeaReel";
import { AwakeCameo, Print } from "../BeaCurtains";
import { BOX, Chip, EndCard, GuessCard, Phone, PhonePage, QuestionCard, Rule, SplitPrints, Tag, Tape, clamp, popIn } from "./parts";
import { MOVE_SECONDS, Stage, StageMove, landsAt } from "./stage";
import { frameOf, totalFrames, VOICE_AT } from "./timing";
import type { EpisodeProps, Scene } from "./types";

/**
 * Any Bea episode, from its file in video/episodes/.
 *
 * Every episode opens the same way — Bea wakes up, the hook above her — and
 * ends on the logo; between them each scene is sewn on with the gold seam at
 * the word it is anchored to. Captions come from the lines, timed by the
 * recording, and each leaves before the next arrives. Bea watches from her
 * brooch whenever she is not the picture.
 */

export const calculateEpisodeMetadata: CalculateMetadataFunction<EpisodeProps> = ({ props }) => ({
  durationInFrames: totalFrames(props.timing),
});

const WIPE = 22;

export const Episode: React.FC<EpisodeProps> = ({ episode, timing }) => {
  const frame = useCurrentFrame();
  const at = (a: Parameters<typeof frameOf>[0]) => frameOf(a, timing);
  const total = totalFrames(timing);

  // Without a wake scene the first scene is on screen from the first frame
  const hasWake = episode.scenes.some((s) => s.type === "wake");
  const scenes = episode.scenes.map((scene, i) => ({ scene, start: scene.type === "wake" || (!hasWake && i === 0) ? 0 : at(scene.at) }));
  const wake = scenes.find((s) => s.scene.type === "wake")?.scene as Extract<Scene, { type: "wake" }> | undefined;
  const firstCut = scenes.find((s) => s.scene.type !== "wake")?.start ?? total;
  const stageMoves = (scene: Extract<Scene, { type: "stage" }>, start: number): StageMove[] =>
    (scene.moves ?? []).map((m) => ({
      actor: m.actor,
      do: m.do,
      start: at(m.at) - start,
      dur: Math.round((m.dur ?? MOVE_SECONDS[m.do]) * 30),
      to: m.to,
      height: m.height ?? 120,
      scale: m.scale ?? 1.25,
      rot: m.rot ?? 80,
    }));
  const end = scenes.find((s) => s.scene.type === "end");
  const endStart = end?.start ?? total;
  const current = [...scenes].reverse().find((s) => frame >= s.start)?.scene.type ?? "wake";

  // Captions, each gone before the next arrives
  const captions = timing.lines
    .map((l, i) => ({ i, text: episode.lines[i].text, show: episode.lines[i].caption !== false, from: at(`line:${i}`), endAt: at(`line:${i}:end`) }))
    .map((c, i, all) => ({ ...c, to: i + 1 < all.length ? Math.min(c.endAt + 4, all[i + 1].from - 10) : c.endAt + 4 }))
    .filter((c) => c.show);

  const voiceEnd = VOICE_AT + Math.round(timing.duration * 30);
  // Where Bea holds her breath (a line with a pause): the music comes up under the silence
  const hushes = episode.lines
    .map((l, i) => (l.pause && i > 0 ? [at(`line:${i - 1}:end`) + 4, at(`line:${i}`) - 4] : null))
    .filter((w): w is number[] => w !== null && w[1] - w[0] > 16);
  const music = (f: number) => {
    const fadeIn = interpolate(f, [0, 10], [0, 1], { extrapolateRight: "clamp" });
    const fadeOut = interpolate(f, [total - 36, total - 2], [1, 0], clamp);
    const hush = Math.max(0, ...hushes.map(([a, b]) => Math.min(interpolate(f, [a, a + 10], [0, 1], clamp), interpolate(f, [b - 8, b], [1, 0], clamp))));
    const base = f >= VOICE_AT - 4 && f <= voiceEnd + 6 ? 0.13 + 0.12 * hush : 0.3;
    return base * fadeIn * fadeOut;
  };
  const hook = interpolate(frame, [0, 8], [0.35, 1], { ...clamp, easing: ease });
  const captionTop = current === "wake" || current === "guess" || current === "stage" ? 1440 : current === "phone" ? 1390 : 1420;

  const sceneBody = (scene: Scene, start: number) => {
    switch (scene.type) {
      case "question":
        return <QuestionCard eyebrow={scene.eyebrow ?? "Ask Kristina"} text={scene.text} reveal={(scene.reveal !== undefined ? at(scene.reveal) : start + 10) - start} />;
      case "print":
        return (
          <Print
            src={scene.src}
            label={scene.label}
            tilt={scene.tilt ?? -1}
            zoomTo={scene.zoomTo ?? 1.06}
            origin={scene.origin ?? "50% 60%"}
            frames={Math.max(1, (scenes.find((s) => s.start > start)?.start ?? total) - start)}
          />
        );
      case "phone": {
        const pages: PhonePage[] = scene.pages.map((p, i) => {
          const from = at(p.at) - start;
          const next = scene.pages[i + 1];
          const nextFrom = next ? at(next.at) - start : undefined;
          return {
            src: p.src,
            from: i === 0 ? 0 : from,
            to: nextFrom !== undefined ? nextFrom + 14 : 100000,
            enter: i > 0,
            exitAt: nextFrom,
            scroll: (p.scroll ?? [[p.at, 0]]).map(([a, y]) => [at(a) - start, y] as [number, number]),
          };
        });
        return <Phone pages={pages} />;
      }
      case "end": {
        const rel = (a: Parameters<typeof frameOf>[0] | undefined, fallback: number) => (a !== undefined ? at(a) - start : fallback);
        return (
          <EndCard
            lead={scene.lead}
            title={scene.title}
            subtitle={scene.subtitle}
            url={scene.url}
            time={frame / 30}
            at={{
              lead: rel(scene.leadAt, 8),
              title: rel(scene.titleAt, scene.lead ? 30 : 8),
              subtitle: rel(scene.subtitleAt, 26),
              url: rel(scene.urlAt, 40),
            }}
          />
        );
      }
      case "guess":
        return (
          <GuessCard
            src={scene.src}
            label={scene.label}
            zoomTo={scene.zoomTo ?? 1.12}
            origin={scene.origin ?? "50% 50%"}
            ask={scene.ask}
            answer={scene.answer}
            note={scene.note}
            countFrom={at(scene.countAt) - start}
            answerAt={at(scene.answerAt) - start}
            count={scene.count ?? 3}
            frames={Math.max(1, (scenes.find((s) => s.start > start)?.start ?? total) - start)}
          />
        );
      case "stage": {
        const rel = (a: Parameters<typeof frameOf>[0] | undefined) => (a !== undefined ? at(a) - start : undefined);
        return (
          <Stage
            actors={scene.actors}
            moves={stageMoves(scene, start)}
            lightsOff={rel(scene.lightsOff)}
            lightsOn={rel(scene.lightsOn)}
            torch={(scene.torch ?? []).map(([a, x, y]) => [at(a) - start, x, y] as [number, number, number])}
            zzz={scene.zzz && { actor: scene.zzz.actor, from: at(scene.zzz.from) - start, to: at(scene.zzz.to) - start }}
          />
        );
      }
      case "split":
        return (
          <SplitPrints
            before={scene.before}
            after={scene.after}
            beforeLabel={scene.beforeLabel ?? "Before"}
            afterLabel={scene.afterLabel ?? "After"}
            afterFrom={scene.afterAt !== undefined ? at(scene.afterAt) - start : 0}
          />
        );
      default:
        return null;
    }
  };

  return (
    <AbsoluteFill style={{ background: CREAM }}>
      <Audio src={staticFile("bea/music.mp3")} volume={music} />
      <Sequence from={VOICE_AT} layout="none">
        <Audio src={staticFile(`bea/episodes/${episode.id}/voice.mp3`)} />
      </Sequence>

      {/* A tick for every number of a countdown, a bell for the answer */}
      {scenes.flatMap(({ scene }, i) => {
        if (scene.type !== "guess") return [];
        const from = at(scene.countAt);
        const answer = at(scene.answerAt);
        const n = scene.count ?? 3;
        return [
          ...Array.from({ length: n }, (_, k) => (
            <Sequence key={`tick${i}-${k}`} from={Math.round(from + (k * (answer - from)) / n)} durationInFrames={20} layout="none">
              <Audio src={staticFile("bea/sfx-tick.mp3")} volume={0.55} />
            </Sequence>
          )),
          <Sequence key={`ding${i}`} from={answer - 1} layout="none">
            <Audio src={staticFile("bea/sfx-ding.mp3")} volume={0.6} />
          </Sequence>,
        ];
      })}

      {/* Sounds at moments, and each stage move's landing */}
      {(episode.sounds ?? []).map(([src, when, volume], i) => (
        <Sequence key={`snd${i}`} from={at(when)} layout="none">
          <Audio src={staticFile(src)} volume={volume ?? 0.6} />
        </Sequence>
      ))}
      {scenes.flatMap(({ scene, start }, i) =>
        scene.type !== "stage"
          ? []
          : stageMoves(scene, start).flatMap((m, k) => {
              const sound = (scene.moves ?? [])[k]?.sound;
              return sound ? [<Sequence key={`land${i}-${k}`} from={start + landsAt(m) - 1} layout="none"><Audio src={staticFile(sound)} volume={0.5} /></Sequence>] : [];
            }),
      )}

      {/* Bea wakes up */}
      {hasWake && frame < firstCut + WIPE && (
        <AbsoluteFill>
          <OffthreadVideo src={staticFile("bea/wake.mp4")} muted trimBefore={12} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {wake && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 300,
                textAlign: "center",
                fontFamily: serifItalic,
                fontSize: 96,
                color: PLUM,
                opacity: hook,
                transform: `translateY(${(1 - hook) * 18}px)`,
              }}
            >
              {wake.hook}
            </div>
          )}
        </AbsoluteFill>
      )}

      {scenes
        .filter((s) => s.scene.type !== "wake")
        .map(({ scene, start }, i) =>
          start === 0 ? (
            <AbsoluteFill key={i}>{sceneBody(scene, start)}</AbsoluteFill>
          ) : (
            <Sewn key={i} at={start}>
              {sceneBody(scene, start)}
            </Sewn>
          ),
        )}

      {/* Overlays over the scenes */}
      {(episode.overlays ?? []).map((o, i) => {
        const from = at(o.from);
        const to = at(o.to);
        if (frame < from || frame > to) return null;
        switch (o.type) {
          case "chip":
            return <Chip key={i} text={o.text} x={o.x} y={o.y} k={popIn(frame, from, to)} dark={o.dark} />;
          case "tag":
            return <Tag key={i} text={o.text} k={popIn(frame, from, to)} top={o.y ?? 760} />;
          case "tape": {
            const [g0, g1] = o.grow;
            const grow = interpolate(frame, [at(g0), at(g1)], [0, 1], clamp);
            return (
              <Tape
                key={i}
                x={o.x}
                top={o.top}
                bottom={o.bottom}
                grow={grow}
                topLabel={o.topLabel}
                bottomLabel={o.bottomLabel}
                topK={interpolate(frame, [at(g0), at(g0) + 10], [0, 1], clamp)}
                bottomK={interpolate(frame, [at(g1) - 4, at(g1) + 6], [0, 1], clamp)}
              />
            );
          }
          case "title": {
            const k = Math.min(interpolate(frame, [from, from + 8], [0.35, 1], { ...clamp, easing: ease }), interpolate(frame, [to - 8, to], [1, 0], clamp));
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: o.left ?? 60,
                  right: o.right ?? 60,
                  top: o.y ?? 270,
                  textAlign: "center",
                  fontFamily: serifItalic,
                  fontSize: o.size ?? 88,
                  lineHeight: 1.1,
                  color: PLUM,
                  opacity: k,
                  transform: `translateY(${(1 - k) * 18}px)`,
                  textWrap: "balance",
                }}
              >
                {o.text}
              </div>
            );
          }
          case "rule": {
            const draw = interpolate(frame, [from, from + 26], [0, 1], { ...clamp, easing: ease });
            return <Rule key={i} y={o.y} draw={draw} label={o.label} labelK={interpolate(frame, [from + 24, from + 34], [0, 1], clamp)} />;
          }
          default:
            return null;
        }
      })}

      {/* Captions and Bea's brooch */}
      {frame < endStart &&
        captions.map((c) => <Caption key={c.i} text={c.text} from={c.from} to={c.to} top={captionTop} onFootage={current === "stage"} />)}
      {firstCut < endStart && <AwakeCameo from={firstCut + 10} to={endStart + 4} />}
    </AbsoluteFill>
  );
};

// Kept for episode files that place a chip by the print's own coordinates
export const printPoint = (x: number, y: number) => ({ x: BOX.left + BOX.w * x, y: BOX.top + BOX.h * y });
