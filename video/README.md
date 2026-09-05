# Instagram videos

Short films built from the shop's own product photographs, in the shop's own
colours and typefaces. Separate from the Next app on purpose: Remotion pulls in
a headless browser and a renderer, and none of that belongs in what Vercel
builds.

## Render

```bash
cd video
npm install
npm run render -- Feed out/post.mp4     # 1080×1350, the Instagram feed
npm run render -- Story out/story.mp4   # 1080×1920, stories and reels
```

`npm run studio` opens Remotion's editor, where you can scrub the timeline and
see a change without rendering the whole thing.

## Change which pieces are in it

`src/products.json` lists them in order. Each entry needs a photograph in
`public/products/`, cropped to 1080×1350. To pull a fresh one from the shop:

```
https://cdn.sanity.io/images/5uun6fw6/production/<asset>?w=1080&h=1350&fit=crop&crop=entropy&fm=jpg&q=88
```

`fm=jpg` matters: without it Sanity answers WebP to anything that says it can
take it, and the renderer is one of those things.

## How it is put together

- `src/Reel.tsx` — the film: an opening card, one scene per piece, a closing card.
- `src/Seam.tsx` — the transition. A dashed seam travels across the frame and
  the next photograph appears in its wake, because that is what happens in the
  atelier all day. It is the reason this does not look like a template.
- `src/theme.ts` — colours, format and timings, all in one place.

The name and price sit on a cream card rather than over the photograph:
almost everything here is white or cream on a pale background, and white type
over it disappears into the fabric.
