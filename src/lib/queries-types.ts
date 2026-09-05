export interface QueryPage {
  slug: string;
  kw: string;
  title: string;
  desc: string;
  vol: number;
  intent: string;
  body: string;
  faqs: Array<[string, string]>;
}