# TasteMaker UI Design System

This document outlines the visual language and component standards for the TasteMaker application. Use these guidelines to maintain consistency across the application.

## 1. Core Philosophy
**"Soft Modern Minimalism"**
- High-contrast functionality (Black/White)
- Extremely soft, tactile layers (diffuse shadows, heavy rounding)
- Absence of gradients (flat, solid, confident colors)
- "Premium" feel through generous whitespace and large touch targets

---

## 2. Foundations

### Colors
**App Background**
- `bg-[#F3F4F6]` (Cool Light Gray)

**Surface Colors**
- Card Background: `bg-white`
- Secondary Backgrounds: `bg-gray-50` (Used for inputs, secondary buttons, tag containers)

**Text & Action Colors**
- **Primary Black**: `#171717` (Used for primary buttons, main headings)
- **Primary Text**: `text-gray-900` or `#171717`
- **Secondary Text**: `text-gray-500`
- **Focus Rings**: `ring-black` / `border-black`

### Shapes & Depth
**Border Radius**
- **Cards/Containers**: `rounded-[32px]` (The signature shape)
- **Buttons/Inputs**: `rounded-[24px]` or `rounded-full` for smaller tags
- **Inner Elements**: `rounded-2xl` (images, skeletons)

**Shadows**
- **Standard Card Shadow**: `shadow-[0_8px_30px_rgb(0,0,0,0.04)]`
- **Hover Lift**: `shadow-[0_4px_12px_rgb(0,0,0,0.12)]` (often paired with scale)

### Typography
- **Headings**: `font-bold tracking-tight text-[#171717]` (Size 3xl/4xl)
- **Body**: Standard sans-serif (Inter/Geist), legible, typically `text-lg` for readability
- **Labels**: `uppercase tracking-wide text-xs font-medium text-gray-400`

---

## 3. Component Standards

### Cards (The "Stack" Look)
The core container for the application.
```tsx
<div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
  {/* Content */}
</div>
```
*Standard Dimensions*: `w-full max-w-[360px] h-[520px]` (for the main card stack)

### Buttons
**Primary Action**
Solid black, large, tactile.
```tsx
<button className="bg-[#171717] text-white h-[72px] rounded-[32px] font-bold text-lg hover:bg-black hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
  Label
</button>
```

**Secondary/Cancel**
Subtle gray, no shadow.
```tsx
<button className="h-[72px] rounded-[32px] font-bold text-lg text-gray-700 bg-white hover:bg-gray-50 transition-all shadow-[0_4px_12px_rgb(0,0,0,0.06)]">
  Label
</button>
```

### Inputs / Textareas
Flat, light gray background, minimal borders.
```tsx
<textarea className="bg-gray-50 border border-gray-200 focus:border-black focus:ring-black rounded-[24px] p-4 resize-none transition-all" />
```

### Loading State (Skeleton)
Matches the softness of the UI.
- Color: `bg-gray-200/50` or `bg-gray-100` components
- Animation: Custom `shimmer`
- Class: `rounded-[24px]` or `rounded-full`

---

## 4. Interaction Patterns
- **Hover**: Subtle scale (`scale-[1.02]`) + shadow increase.
- **Active/Click**: Subtle depress (`scale-[0.98]`).
- **Modals**: Dark blur backdrop (`bg-black/60 backdrop-blur-sm`), centered card with `rounded-[32px]`.
