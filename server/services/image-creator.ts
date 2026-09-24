import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { mediaUrlFor, rendersDir, runFfmpeg, workDir } from "./media.js";
import { generateImage } from "./providers.js";
import { assText, fitChain, fontsDir, probeVideoSize, type AspectRatio } from "./video-renderer.js";

export type ImageFormat = AspectRatio | "4:5";

export const IMAGE_SIZES: Record<ImageFormat, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "4:5": { w: 1080, h: 1350 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

export interface ComposeInput {
  format: ImageFormat;
  /** Local image to build on; null means a brand-gradient card. */
  base: string | null;
  /** "full" fills the frame with the image; "card" floats it on the gradient. */
  layout: "full" | "card";
  headline?: string;
  subline?: string;
  brandColors: [string, string];
  label?: string;
}

const hex = (c: string) => (/^#?[0-9a-f]{6}$/i.test(c) ? c.replace("#", "") : "3155d8");

function textLayer(input: ComposeInput, w: number, h: number, file: string) {
  const font = process.env.CAPTION_FONT || "DejaVu Sans";
  const base = Math.min(w, h);
  const title = Math.round(base * 0.095);
  const sub = Math.round(base * 0.045);
  const small = Math.round(base * 0.026);
  const onImage = input.layout === "full" && input.base;
  // On a full-bleed photo the text sits low; on a card it sits above the product.
  const titleY = onImage ? Math.round(h * 0.74) : input.base ? Math.round(h * 0.2) : Math.round(h * 0.44);
  const lines = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${w}`, `PlayResY: ${h}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Title,${font},${title},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,${onImage ? Math.round(title * 0.05) : 0},${Math.round(title * 0.04)},5,${Math.round(w * 0.07)},${Math.round(w * 0.07)},0,1`,
    `Style: Sub,${font},${sub},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,${onImage ? Math.round(sub * 0.06) : 0},0,8,${Math.round(w * 0.09)},${Math.round(w * 0.09)},0,1`,
    `Style: Label,${font},${small},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,3,${Math.round(small * 0.3)},0,1,${Math.round(w * 0.04)},${Math.round(w * 0.04)},${Math.round(h * 0.03)},1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const ev = (style: string, text: string) => lines.push(`Dialogue: 0,0:00:00.00,0:00:05.00,${style},,0,0,0,,${text}`);
  // Headline is bottom-anchored so extra lines grow upward, never into the subline.
  const gap = Math.round(title * 0.25);
  if (input.headline) ev("Title", `{\\an2\\pos(${Math.round(w / 2)},${titleY})}${assText(input.headline.toUpperCase())}`);
  if (input.subline) ev("Sub", `{\\an8\\pos(${Math.round(w / 2)},${titleY + (input.headline ? gap : 0)})}${assText(input.subline)}`);
  if (input.label) ev("Label", assText(input.label));
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

/** Build a finished PNG: photo or gradient, optional product float, burned-in text. */
export async function composeImage(input: ComposeInput): Promise<string> {
  const { w, h } = IMAGE_SIZES[input.format];
  const scratch = path.join(workDir, `img_${uuidv4()}`);
  fs.mkdirSync(scratch, { recursive: true });
  try {
    const [c0, c1] = input.brandColors.map(hex);
    const args: string[] = [];
    const filters: string[] = [];
    const gradient = `gradients=s=${w}x${h}:c0=0x${c0}:c1=0x${c1}:x0=0:y0=0:x1=${w}:y1=${h}:d=1`;

    if (input.base && input.layout === "full") {
      args.push("-i", input.base);
      const dims = await probeVideoSize(input.base);
      filters.push(fitChain("0:v", "fit", w, h, dims ? dims.w / dims.h : null));
      // Darken the lower part so white text stays readable on any photo.
      filters.push(input.headline || input.subline
        ? `[fit]drawbox=x=0:y=${Math.round(h * 0.58)}:w=${w}:h=${h - Math.round(h * 0.58)}:color=black@0.38:t=fill[base]`
        : `[fit]null[base]`);
    } else if (input.base) {
      args.push("-f", "lavfi", "-i", gradient, "-i", input.base);
      const maxW = Math.round(w * 0.72);
      const maxH = Math.round(h * (input.headline ? 0.5 : 0.7));
      filters.push(`[1:v]scale=${maxW}:${maxH}:force_original_aspect_ratio=decrease[prod]`);
      filters.push(`[0:v][prod]overlay=(W-w)/2:${input.headline ? `H*0.62-h/2` : `(H-h)/2`}[base]`);
    } else {
      args.push("-f", "lavfi", "-i", gradient);
      filters.push(`[0:v]null[base]`);
    }

    let last = "base";
    if (input.headline || input.subline || input.label) {
      textLayer(input, w, h, path.join(scratch, "text.ass"));
      const fonts = fontsDir();
      filters.push(`[base]subtitles=text.ass${fonts ? `:fontsdir='${fonts.replace(/\\/g, "/").replace(/:/g, "\\:")}'` : ""}[txt]`);
      last = "txt";
    }
    filters.push(`[${last}]format=rgb24[out]`);

    const out = path.join(rendersDir, `image_${Date.now()}_${uuidv4().slice(0, 6)}.png`);
    await runFfmpeg([...args, "-filter_complex", filters.join(";"), "-map", "[out]", "-frames:v", "1", out], scratch);
    return out;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

const STYLE_PROMPTS: Record<string, string> = {
  product_ad: "Premium advertising product photograph, studio lighting, clean background, sharp focus on the product, commercial quality",
  lifestyle: "Authentic lifestyle photograph of the product being used in a real everyday setting, natural light, shot on a phone, candid",
  ugc_selfie: "Casual smartphone selfie of a fictional adult content creator holding the product, natural light, relatable, UGC style",
  thumbnail: "Eye-catching high-contrast YouTube thumbnail background, bold composition, vivid colors, room for text",
  flat_lay: "Overhead flat lay photograph with the product and complementary props, soft shadows, editorial styling",
  custom: "",
};

export const IMAGE_STYLES = Object.keys(STYLE_PROMPTS) as Array<keyof typeof STYLE_PROMPTS>;

export async function generateStyledImage(prompt: string, style: string, productName: string | undefined, format: ImageFormat): Promise<string> {
  const orientation = format === "16:9" ? "landscape" : format === "1:1" ? "square" : "portrait";
  const full = [STYLE_PROMPTS[style] ?? "", productName ? `The product is ${productName}.` : "", prompt]
    .filter(Boolean)
    .join(" ");
  const file = path.join(workDir, `gen_${uuidv4()}.png`);
  await generateImage(full, file, orientation);
  return file;
}

export { mediaUrlFor };
