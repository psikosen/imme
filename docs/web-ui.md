# Web UI Design Notes

The Imme web control center embraces dark mode with the palette provided by the team:

- Background: `#2F212F`
- Primary surface: `#565A7B`
- Muted text: `#8C8789`
- Highlight text: `#EAF0EC`

## UX Principles Applied

- **Aesthetic-Usability Effect:** A polished, high-contrast gradient and layered cards
  increase perceived usability while maintaining accessible color ratios.
- **Hick's Law:** Every panel focuses on a single decision—select a project, review its
  tasks—limiting the number of simultaneous choices.
- **Jakob's Law:** Familiar list-card patterns and pill statuses mirror modern project
  tools, reducing the cognitive load for new contributors.
- **Law of Proximity:** Grouped summary data uses CSS grids to establish clear visual
  relationships between workspace attributes.
- **Peak-End Rule:** The footer reinforces the UX principles and mission, ending the
  experience on a consistent note.

## Interaction Model

1. **Refresh button** pulls configuration and database state in one click, with focus
   rings sized using Fitts's Law for fast acquisition.
2. **Project cards** act as large hit targets; active cards receive subtle glows to
   signal state changes.
3. **Tasks panel** uses polite live regions so screen readers announce updates when a
   project is selected.

## Accessibility Checklist

- Semantic headings (`h1`/`h2`) guide assistive navigation.
- High-contrast pill badges distinguish task statuses.
- Reduced motion: only lightweight hover transitions are used; no flashing.
- Keyboard support: project cards are keyboard-activatable via focus-within styling.
