export type SlidePlacement = 'top' | 'center' | 'bottom';

export type Slide = {
  id: string;
  title: string;
  body: string;
  placement: SlidePlacement;
  backgroundType: 'color' | 'image';
  backgroundColor: string;
  backgroundImageUrl: string | null;
  backgroundImageBase64: string | null;
  titleColor: string;
  bodyColor: string;
  generatedImageBase64: string | null;
};

export type CarouselState = {
  slides: Slide[];
  activeSlideId: string | null;
  isGenerating: boolean;
  generatingIndex: number;
  hasGenerated: boolean;
};

export const CAROUSEL_DEFAULT_BG = '#1A1A2E';
