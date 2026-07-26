export interface StyleDefinition {
  id: string;
  name: string;
  prompt: string;
}

const GARMENT_PRESERVATION =
  'CRITICAL: Preserve the clothing exactly as shown — every logo (especially SUZUKI), all text, textures, stitching, colors, folds and proportions of the outfit. Do not redesign, replace or restyle any garment. Transform only the artistic rendering style.';

export const STYLE_CATALOG: StyleDefinition[] = [
  {
    id: 'anime-football',
    name: 'Anime Fútbol',
    prompt:
      "Transform this photo into a modern high-budget Japanese sports anime illustration: the person as an elite football striker on a floodlit stadium pitch at night, intense glowing eyes, dramatic rim lighting, a crackling electric-blue energy aura, dynamic speed lines, a football charged with swirling blue energy at their feet, cinematic wide-angle composition, packed stadium with bokeh lights in the background, crisp cel-shading with painterly highlights. Do NOT include any existing anime characters, franchise logos or team crests. Keep the person's exact pose and proportions, with the entire body visible from head to toe. " +
      GARMENT_PRESERVATION,
  },
  {
    id: 'kart-arcade',
    name: 'Kart Racer',
    prompt:
      'Transform this person into a 3D animated kart-racing video game character in the glossy, toy-like render style of modern Japanese kart racing games: big expressive cartoon eyes, cheerful grin, slightly chibi proportions. They are drifting a colorful oversized go-kart with rainbow spark trails flying from the wheels, mid-race on a vibrant fantasy circuit: a rainbow-colored track looping through the sky, floating glowing item cubes, golden coins scattered in the air, speed-boost arrows glowing on the asphalt, checkered flags, confetti and a cheering cartoon crowd in the background, bright blue sky with puffy clouds, saturated candy colors, dynamic racing camera angle with motion blur on the track. Do NOT include any Nintendo, Mario or other copyrighted game characters, items or logos. ' +
      GARMENT_PRESERVATION,
  },
  {
    id: 'action-figure',
    name: 'Figura de Acción',
    prompt:
      'Turn this person into a premium collectible action figure sealed inside a transparent plastic blister on a printed cardboard backing card themed SUZUKI RACING TEAM with red branding. Accessories in separate blister compartments: a mini motorcycle helmet, a tiny Jimny 4x4 and a mini football. Collector-grade packaging with product title, studio product-photography lighting with softbox reflections on the clear plastic, clean background. Keep the entire figure visible. ' +
      GARMENT_PRESERVATION,
  },
];
