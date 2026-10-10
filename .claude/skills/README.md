# Skills

Emil Kowalski's design engineering skills, copied from
[emilkowalski/skills](https://github.com/emilkowalski/skills) at commit `e8a175d`
(2 October 2026). Claude Code picks them up in this repository on its own.

| Skill | Use it for |
| --- | --- |
| `emil-design-eng` | The main one: UI polish, easing, durations, the review checklist |
| `animate` | Building a new animation the right way |
| `review-animations` | A strict review of motion code (run as `/review-animations`) |
| `improve-animations` | Auditing every animation on the site, with plans in `plans/` |
| `find-animation-opportunities` | Where motion would help, and where it would not |
| `animation-vocabulary` | The right name for an effect you can only describe |
| `apple-design` | Springs, gestures, sheets, depth, Apple-style typography |
| `mobile-native` | Making the site feel like an app on a phone |
| `break-ui` | Worst-case data: long names, empty lists, emoji |
| `pick-ui-library` | Which library to reach for (run as `/pick-ui-library`) |
| `prototype` | Several versions of one piece of UI behind a switcher (run as `/prototype`) |

Left out: `write-swift` and `animate-expo` (no Swift or React Native here) and
`ask-sonner` (the site does not use Sonner).

To update, clone the repository again, copy the same folders over these, and
change the commit above.

## Taste skill

Two skills from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) at
commit `717446e` (9 October 2026):

| Skill | Use it for |
| --- | --- |
| `design-taste-frontend` | Landing pages and new sections that must not look templated (run as `/design-taste-frontend`) |
| `redesign-existing-projects` | Lifting an existing page: audit first, then fix what looks generic (run as `/redesign-existing-projects`) |

Both run only when called by name: `disable-model-invocation: true` was added
to their headers. They take a strong line on visual direction and ban every em
dash in visible copy, while the site's copy uses them and its brand is settled,
so they should not switch on during everyday edits. Delete that line to let
Claude reach for them on its own.

Left out: the fixed-style skills (minimalist, brutalist, soft, gpt-taste),
Google Stitch, image generation, brand kits and the v1 copy.

To update, clone again, copy `skills/taste-skill` to `design-taste-frontend` and
`skills/redesign-skill` to `redesign-existing-projects`, add the line back, and
change the commit above.

## Licences

### emilkowalski/skills

MIT License

Copyright (c) 2026 Emil Kowalski

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### Leonxlnx/taste-skill

MIT License

Copyright (c) 2026 Leonxlnx

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
