export interface StyleDefinition {
  id: string;
  name: string;
  prompt: string;
}

export const STYLE_CATALOG: StyleDefinition[] = [
  {
    id: 'anime-racing',
    name: 'Anime',
    prompt:
      'Transform this photo into a 1990s Japanese street-racing anime illustration (cel-shaded, hand-drawn): night city backdrop with neon lights, wet asphalt reflections, dramatic speed lines, cinematic teal-and-magenta lighting. The person keeps their exact pose and proportions. CRITICAL: preserve the garment design and ALL logos and text on the clothing (especially the SUZUKI logo) exactly as they appear, sharp and legible.',
  },
  {
    id: 'kart-arcade',
    name: 'Kart Racer',
    prompt:
      'Turn this person into a cheerful 90s Japanese arcade kart-racing video game character: riding a colorful generic go-kart on a bright cartoon racetrack with generic coins, balloons and checkered flags, vibrant toy-like 3D render style. Do NOT include any Nintendo, Mario or other copyrighted game characters, items or logos. The character wears exactly the same garment as the photo. CRITICAL: keep the SUZUKI logo and garment graphics visible and legible.',
  },
  {
    id: 'action-figure',
    name: 'Figura de Acción',
    prompt:
      "Turn this person into a collectible action figure inside a retail blister box. The box is themed 'SUZUKI RACING TEAM' with red branding, includes accessories: a mini motorcycle helmet and a tiny Jimny 4x4. The figure wears exactly the same garment as in the photo. CRITICAL: keep all garment logos and text (SUZUKI) legible on both the figure and the packaging.",
  },
];
