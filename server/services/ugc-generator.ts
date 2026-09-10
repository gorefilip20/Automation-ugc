import { v4 as uuidv4 } from "uuid";

const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1538805060514-97d9cc17730c?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=85",
];

function pickImage(seed: number): string {
  return PLACEHOLDER_IMAGES[seed % PLACEHOLDER_IMAGES.length];
}

export interface AvatarGenerateInput {
  workspaceId: number;
  prompt: string;
  seed: number;
  pose: string;
  wardrobe: string;
  setting?: string;
  composition?: string;
  identityLock: boolean;
  ageConfirmed: boolean;
  referenceImage?: { b64Json: string; mimeType: string; fileName: string };
}

export interface AvatarResult {
  profileId: number;
  imageUrl: string;
  seed: number;
}

export interface BatchResult {
  variationGroup: string;
  results: Array<{
    profileId: number;
    contentId: number;
    imageUrl: string;
    seed: number;
    variationIndex: number;
    isSelected: boolean;
    wardrobe: string;
  }>;
}

export function generateAvatarImageUrl(seed: number): string {
  return pickImage(seed);
}

export function generateVariationGroup(): string {
  return `vg_${uuidv4().slice(0, 8)}`;
}

export interface UGCVideoScript {
  hook: string;
  scenes: Array<{
    sceneNumber: number;
    duration: string;
    visual: string;
    dialogue: string;
    textOverlay: string;
    transition: string;
  }>;
  voiceover: string;
  callToAction: string;
  musicSuggestion: string;
  captionStyle: string;
  totalDuration: string;
}

const HOOKS: Record<string, string[]> = {
  testimonial: [
    "I never thought I'd find something that actually works...",
    "Okay, I need to tell you about this because it changed everything for me.",
    "POV: You finally found THE product everyone's been talking about.",
    "Stop scrolling if you've been dealing with [problem]. I was too.",
    "This is not sponsored, I genuinely cannot stop using this.",
  ],
  unboxing: [
    "Let's see what all the hype is about!",
    "I've been waiting WEEKS for this to arrive, let's open it together.",
    "First impressions of the most viral product right now.",
    "Unboxing something I think you're going to love...",
    "The packaging alone had me shook. Wait till you see what's inside.",
  ],
  tutorial: [
    "Save this for later because you're going to need it.",
    "Here's the routine that changed my entire [morning/night/workflow].",
    "Step by step, no skipping. Here's how I actually use this.",
    "The way I use this is probably not what you'd expect.",
    "Quick tutorial that's about to save you so much time.",
  ],
  review: [
    "Honest review, no filter, no BS.",
    "I've been testing this for 30 days. Here's my honest take.",
    "Is it worth the hype? Let me break it down for you.",
    "Rating this from 1 to 10 and I'll tell you exactly why.",
    "The truth about this product that nobody's talking about.",
  ],
  lifestyle: [
    "A day in my life with my new favorite thing.",
    "How this one product elevated my entire daily routine.",
    "The little things that make my day feel complete.",
    "Romanticizing my life, one product at a time.",
    "Soft life essentials that actually deliver.",
  ],
  before_after: [
    "The transformation is INSANE. Swipe to see.",
    "Day 1 vs Day 30. I'm speechless.",
    "You won't believe this is the same person.",
    "Before and after using this for just two weeks.",
    "The glow up is real. Let me show you the proof.",
  ],
  day_in_life: [
    "Come spend the day with me and see what I'm obsessed with.",
    "A chill day in my life featuring my new obsession.",
    "Productive morning routine with my must-have products.",
    "What I actually use every single day, no cap.",
    "Follow me around to see my favorite daily essentials.",
  ],
  get_ready: [
    "Get ready with me using only my current favorites.",
    "GRWM for a night out, and yes, this product is the star.",
    "My go-to routine that takes less than 15 minutes.",
    "Getting ready has never been this easy. Let me show you.",
    "The GRWM that's about to change your whole routine.",
  ],
  haul: [
    "Everything I bought this month, and was it worth it?",
    "Mini haul of things I'm actually going to use.",
    "I went a little overboard but honestly, no regrets.",
    "Haul of products that are actually worth your money.",
    "Things I recently got that you NEED to know about.",
  ],
  storytelling: [
    "Let me tell you about the time I discovered something life-changing.",
    "This is the story of how one product changed my perspective.",
    "Gather round, because this story has a happy ending.",
    "You know those moments that just click? This was mine.",
    "I almost didn't try this. I'm so glad I did.",
  ],
};

const SCENE_TEMPLATES: Record<
  string,
  Array<{ visual: string; dialogue: string; textOverlay: string }>
> = {
  testimonial: [
    {
      visual:
        "Close-up face shot, natural lighting, authentic and relatable setting",
      dialogue:
        "So I've been dealing with [problem] for a while now, and I tried literally everything.",
      textOverlay: "Finally found what works",
    },
    {
      visual: "Product reveal, hands holding the item, clean background",
      dialogue:
        "Then someone told me about [product] and honestly I was skeptical at first.",
      textOverlay: "[Product Name]",
    },
    {
      visual:
        "Demonstration shot showing the product in use, B-roll of application",
      dialogue:
        "But after using it for just [time period], I started noticing real changes.",
      textOverlay: "Real results in [timeframe]",
    },
    {
      visual: "Satisfied reaction, genuine smile, before/after if applicable",
      dialogue:
        "Now I literally cannot go a day without it. Link is in my bio if you want to try it.",
      textOverlay: "Link in bio!",
    },
  ],
  unboxing: [
    {
      visual: "Sealed package on a clean desk or table, anticipation build-up",
      dialogue:
        "Okay it's finally here. I've been waiting for this and I'm so excited.",
      textOverlay: "It's here!",
    },
    {
      visual: "Opening the packaging, close-up of branded box and details",
      dialogue:
        "First of all, the packaging is beautiful. They really put thought into this.",
      textOverlay: "The details matter",
    },
    {
      visual:
        "Pulling out the product, first touch and reaction, examining details",
      dialogue:
        "Oh wow, it feels even better than I expected. Look at the quality of this.",
      textOverlay: "[Product Name] first look",
    },
    {
      visual: "First use or application, genuine reaction shot",
      dialogue:
        "Okay, first impressions? I'm already obsessed. This was so worth the wait.",
      textOverlay: "Verdict: Worth it!",
    },
  ],
  tutorial: [
    {
      visual: "Face to camera, friendly and inviting, clean background",
      dialogue:
        "Alright, I'm going to walk you through exactly how I use this step by step.",
      textOverlay: "Step-by-step tutorial",
    },
    {
      visual: "Overhead or close-up of step 1, clear demonstration",
      dialogue:
        "Step one, [action]. This is the foundation and it makes all the difference.",
      textOverlay: "Step 1: [Action]",
    },
    {
      visual: "Continuation of process, different angle, showing technique",
      dialogue:
        "Step two, [action]. Pro tip: [specific advice that adds value].",
      textOverlay: "Step 2: [Action] + Pro tip",
    },
    {
      visual:
        "Final result, satisfied expression, comparison if applicable, call to action",
      dialogue:
        "And that's it! See how easy that was? Try it yourself and let me know how it goes.",
      textOverlay: "Your turn! Follow for more",
    },
  ],
  review: [
    {
      visual: "Direct to camera, honest and transparent vibe",
      dialogue:
        "Alright, I've been testing [product] for [time period] and here's my honest take.",
      textOverlay: "Honest [timeframe] review",
    },
    {
      visual: "Product showcase from multiple angles, highlighting features",
      dialogue:
        "What I love: [positive 1], [positive 2], and especially [standout feature].",
      textOverlay: "The good",
    },
    {
      visual: "Real usage footage, demonstrating the product",
      dialogue:
        "What could be better: [constructive point]. But honestly, it's minor compared to the benefits.",
      textOverlay: "Room for improvement",
    },
    {
      visual: "Rating reveal, genuine summary, call to action",
      dialogue:
        "Overall, I'm giving it a [score] out of 10. Would I recommend it? Absolutely.",
      textOverlay: "[Score]/10 Highly recommend",
    },
  ],
  lifestyle: [
    {
      visual: "Morning routine aesthetic, soft lighting, cozy environment",
      dialogue:
        "There are certain products that just elevate your whole day, you know?",
      textOverlay: "Elevate your routine",
    },
    {
      visual:
        "Seamless integration into daily life, using the product naturally",
      dialogue:
        "I've been incorporating [product] into my daily routine and it just fits.",
      textOverlay: "Fits perfectly into my day",
    },
    {
      visual:
        "Multiple settings showing versatility, different times of day",
      dialogue:
        "Whether I'm [activity 1] or [activity 2], this is always with me.",
      textOverlay: "Versatile and essential",
    },
    {
      visual:
        "Relaxed outro, golden hour or evening vibes, genuine satisfaction",
      dialogue:
        "It's the small upgrades that make the biggest difference. This is one of them.",
      textOverlay: "Small upgrade, big difference",
    },
  ],
  before_after: [
    {
      visual: "Before state, no makeup/filter, raw and real",
      dialogue:
        "Okay, this is me BEFORE using [product]. Completely raw, no filter.",
      textOverlay: "BEFORE",
    },
    {
      visual: "Beginning the transformation, step by step application",
      dialogue:
        "Now I'm going to use [product] the way I've been using it every day for [time].",
      textOverlay: "The process",
    },
    {
      visual: "Gradual reveal of the after state, building anticipation",
      dialogue:
        "And this is what happens after consistent use. Are you seeing this?",
      textOverlay: "AFTER [timeframe]",
    },
    {
      visual: "Side by side comparison, dramatic reveal, satisfied reaction",
      dialogue:
        "The difference speaks for itself. I literally can't believe this is the same [person/thing].",
      textOverlay: "The transformation is real",
    },
  ],
  day_in_life: [
    {
      visual: "Waking up, morning light, cozy bed scene",
      dialogue:
        "Good morning! Come hang out with me today, I want to show you my daily essentials.",
      textOverlay: "A day in my life",
    },
    {
      visual: "Morning routine, getting ready, using products",
      dialogue:
        "First thing I reach for every morning is [product]. It's become non-negotiable.",
      textOverlay: "Morning essential",
    },
    {
      visual: "Midday activity, productive and aesthetic",
      dialogue:
        "I take it with me everywhere. Even when I'm [activity], I always have it on hand.",
      textOverlay: "Always with me",
    },
    {
      visual: "Evening wind-down, reflecting on the day",
      dialogue:
        "Ending the day with my favorites. Honestly, these small moments are everything.",
      textOverlay: "End of a good day",
    },
  ],
  get_ready: [
    {
      visual: "Mirror shot, fresh faced, pre-routine",
      dialogue:
        "Get ready with me! I'm using all my current favorites today.",
      textOverlay: "GRWM",
    },
    {
      visual: "Base routine, applying products step by step",
      dialogue:
        "Starting with [product] because it gives the perfect base for everything else.",
      textOverlay: "Base: [Product]",
    },
    {
      visual: "Key product moment, close up application, wow factor",
      dialogue:
        "Now for the star of the show. This is the one thing that ties everything together.",
      textOverlay: "The star product",
    },
    {
      visual: "Final look reveal, spin or pose, confident and polished",
      dialogue:
        "And we're ready! What do you think? Drop a comment and let me know.",
      textOverlay: "Final look! Comment below",
    },
  ],
  haul: [
    {
      visual: "Shopping bags or packages spread on bed/table",
      dialogue:
        "I may have gone a little overboard this month but I regret nothing.",
      textOverlay: "[Month] Haul",
    },
    {
      visual: "First product reveal, holding up to camera",
      dialogue:
        "First up, [product]. I got this because [reason] and the quality is incredible.",
      textOverlay: "Item 1: [Product]",
    },
    {
      visual: "Quick montage of additional items, each getting a moment",
      dialogue:
        "Also got [product 2] and [product 3]. Both of these were recommendations and they delivered.",
      textOverlay: "More favorites",
    },
    {
      visual:
        "Favorites spread, final recommendation, call to action",
      dialogue:
        "My top pick from this haul? Definitely [product]. Link in bio for everything I showed.",
      textOverlay: "Top pick! Links in bio",
    },
  ],
  storytelling: [
    {
      visual: "Cozy setting, storytelling vibes, warm lighting",
      dialogue:
        "Let me tell you about something that genuinely caught me off guard.",
      textOverlay: "Story time",
    },
    {
      visual: "Reenactment or B-roll of the problem/situation",
      dialogue:
        "I was dealing with [problem] and honestly thought I'd just have to live with it.",
      textOverlay: "The struggle was real",
    },
    {
      visual: "Discovery moment, product introduction, turning point",
      dialogue:
        "Then I came across [product] and thought, why not give it a shot?",
      textOverlay: "The discovery",
    },
    {
      visual: "Happy ending, transformation reveal, genuine emotion",
      dialogue:
        "Fast forward to now, and I honestly can't imagine going back. This changed everything.",
      textOverlay: "Happy ending",
    },
  ],
};

const MUSIC_STYLES: Record<string, string> = {
  testimonial: "Warm acoustic guitar, building confidence, uplifting melody",
  unboxing: "Upbeat lo-fi, anticipation build, satisfying reveal sound",
  tutorial: "Clean and focused background beat, soft electronic, instructional vibe",
  review: "Neutral chill beat, analytical and honest mood",
  lifestyle: "Dreamy indie folk, golden hour vibes, aspirational and warm",
  before_after: "Dramatic build-up, anticipation, triumphant reveal",
  day_in_life: "Chill lo-fi, morning coffee vibes, daily routine energy",
  get_ready: "Pop beat, confident and fun, getting ready energy",
  haul: "Energetic and playful, shopping spree vibes",
  storytelling: "Emotional piano, storytelling build, cinematic feel",
};

export function generateUGCScript(input: {
  productName: string;
  productDescription: string;
  style: string;
  platform: string;
  duration?: number;
  customHook?: string;
  callToAction?: string;
}): UGCVideoScript {
  const {
    productName,
    productDescription,
    style,
    platform,
    duration = 30,
    customHook,
    callToAction,
  } = input;

  const hooks = HOOKS[style] || HOOKS.testimonial;
  const hook =
    customHook ||
    hooks[Math.floor(Math.random() * hooks.length)]
      .replace("[problem]", "finding the right product")
      .replace("[product]", productName);

  const sceneTemplates =
    SCENE_TEMPLATES[style] || SCENE_TEMPLATES.testimonial;

  const sceneDuration =
    duration >= 60
      ? `${Math.floor(duration / sceneTemplates.length)}s`
      : `${Math.floor(duration / sceneTemplates.length)}s`;

  const scenes = sceneTemplates.map((tpl, index) => ({
    sceneNumber: index + 1,
    duration: sceneDuration,
    visual: tpl.visual
      .replace(/\[product\]/gi, productName)
      .replace(/\[timeframe\]/gi, "2 weeks")
      .replace(/\[time period\]/gi, "2 weeks")
      .replace(/\[time\]/gi, "2 weeks"),
    dialogue: tpl.dialogue
      .replace(/\[product\]/gi, productName)
      .replace(/\[product 2\]/gi, "the matching set")
      .replace(/\[product 3\]/gi, "the travel size")
      .replace(/\[problem\]/gi, productDescription)
      .replace(/\[time period\]/gi, "2 weeks")
      .replace(/\[time\]/gi, "2 weeks")
      .replace(/\[timeframe\]/gi, "2 weeks")
      .replace(/\[positive 1\]/gi, "the quality")
      .replace(/\[positive 2\]/gi, "the design")
      .replace(/\[standout feature\]/gi, "how it actually delivers results")
      .replace(/\[constructive point\]/gi, "wish it came in more options")
      .replace(/\[score\]/gi, "9")
      .replace(/\[action\]/gi, "apply a small amount")
      .replace(/\[specific advice that adds value\]/gi, "less is more with this one")
      .replace(/\[activity\]/gi, "working from home")
      .replace(/\[activity 1\]/gi, "working out")
      .replace(/\[activity 2\]/gi, "running errands")
      .replace(/\[reason\]/gi, "everyone kept raving about it")
      .replace(/\[person\/thing\]/gi, "result")
      .replace(/\[Month\]/gi, "This Month's"),
    textOverlay: tpl.textOverlay
      .replace(/\[Product Name\]/gi, productName)
      .replace(/\[Product\]/gi, productName)
      .replace(/\[Action\]/gi, "Apply")
      .replace(/\[Score\]/gi, "9")
      .replace(/\[timeframe\]/gi, "2 weeks")
      .replace(/\[Month\]/gi, "This Month's"),
    transition:
      index === sceneTemplates.length - 1
        ? "Fade to black"
        : ["Smooth cut", "Jump cut", "Swipe transition", "Cross dissolve"][
            index % 4
          ],
  }));

  const voiceover = scenes.map((s) => s.dialogue).join(" ");

  const cta =
    callToAction ||
    `Try ${productName} today! Link in my bio for a special discount.`;

  const platformFormat: Record<string, string> = {
    instagram: "9:16 Reels format, dynamic captions with brand colors",
    tiktok: "9:16 vertical, TikTok-native text overlays, trending sounds",
    youtube_shorts: "9:16 vertical, clean captions, subscribe prompt end screen",
    facebook: "1:1 or 4:5, bold captions, share-friendly format",
  };

  return {
    hook,
    scenes,
    voiceover,
    callToAction: cta,
    musicSuggestion:
      MUSIC_STYLES[style] || MUSIC_STYLES.testimonial,
    captionStyle:
      platformFormat[platform] || platformFormat.instagram,
    totalDuration: `${duration}s`,
  };
}

export function generateCampaignContent(input: {
  productName: string;
  productCategory: string;
  targetAudience: string;
  brandVoice?: string;
  objectives?: string;
  platforms: string[];
  contentTypes: string[];
}): {
  scripts: UGCVideoScript[];
  captions: string[];
  hashtags: string[];
  postingSchedule: Array<{
    day: string;
    time: string;
    platform: string;
    contentType: string;
  }>;
} {
  const scripts = input.contentTypes.map((type) => {
    const style = type.toLowerCase().replace(/\s+/g, "_");
    const validStyle = Object.keys(HOOKS).includes(style)
      ? style
      : "testimonial";
    return generateUGCScript({
      productName: input.productName,
      productDescription: `${input.productCategory} for ${input.targetAudience}`,
      style: validStyle,
      platform: input.platforms[0] || "instagram",
      duration: 30,
    });
  });

  const captions = [
    `Okay I need to talk about ${input.productName} because WOW. If you've been on the fence, this is your sign. ${input.brandVoice || "Trust me on this one."} #${input.productName.replace(/\s+/g, "")} #UGC #Ad`,
    `POV: You finally found the ${input.productCategory} that actually delivers. ${input.productName} has been my go-to for weeks now and I'm not going back. Save this for later! #${input.productName.replace(/\s+/g, "")} #honest_review`,
    `Small things that make a big difference in my day: ${input.productName}. Sometimes it's the simple upgrades that change everything. Link in bio! #dailyessentials #${input.productCategory.replace(/\s+/g, "")}`,
    `Day [X] of using ${input.productName} and the results speak for themselves. Swipe to see the transformation. #transformation #${input.productName.replace(/\s+/g, "")}`,
    `Get ready with me featuring my newest obsession: ${input.productName}. ${input.brandVoice || "This one hits different."} #GRWM #favorites`,
  ];

  const hashtags = [
    `#${input.productName.replace(/\s+/g, "")}`,
    "#UGC",
    "#Ad",
    "#HonestReview",
    `#${input.productCategory.replace(/\s+/g, "")}`,
    "#TikTokMadeMeBuyIt",
    "#ViralProduct",
    "#MustHave",
    "#ProductReview",
    `#${input.targetAudience.replace(/\s+/g, "")}Approved`,
  ];

  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const times = [
    "9:00 AM",
    "12:00 PM",
    "3:00 PM",
    "6:00 PM",
    "8:00 PM",
  ];

  const postingSchedule = input.platforms.flatMap((platform) =>
    days.slice(0, 5).map((day, i) => ({
      day,
      time: times[i % times.length],
      platform,
      contentType:
        input.contentTypes[i % input.contentTypes.length] || "testimonial",
    }))
  );

  return { scripts, captions, hashtags, postingSchedule };
}
