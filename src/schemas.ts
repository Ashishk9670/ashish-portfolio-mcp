import { z } from "zod";

export const StatSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export const ProfileSchema = z.object({
  name: z.string(),
  role: z.string(),
  location: z.string(),
  tagline: z.string(),
  summary: z.string(),
  email: z.string(),
  github: z.string(),
  linkedin: z.string(),
  availableForOpportunities: z.boolean(),
  siteUrl: z.string(),
});

export const ExperienceEntrySchema = z.object({
  company: z.string(),
  role: z.string(),
  location: z.string(),
  start: z.string(),
  end: z.string(),
  bullets: z.array(z.string()),
  stats: z.array(StatSchema),
  impact: z.string(),
  stack: z.array(z.string()).optional(),
});

export const ProjectSchema = z.object({
  slug: z.string(),
  title: z.string(),
  tagline: z.string(),
  stack: z.array(z.string()),
  featured: z.boolean(),
  placeholder: z.boolean().optional(),
  problem: z.string(),
  approach: z.array(z.string()),
  results: z.array(StatSchema),
  outcome: z.string(),
  businessImpact: z.string(),
  links: z.object({ repo: z.string().optional(), live: z.string().optional() }).optional(),
});

export const SkillGroupSchema = z.object({
  category: z.string(),
  items: z.array(z.string()),
});

export const UsesGroupSchema = z.object({
  category: z.string(),
  blurb: z.string(),
  items: z.array(z.string()),
});

export const SkillsDataSchema = z.object({
  skills: z.array(SkillGroupSchema),
  usesStack: z.array(UsesGroupSchema),
});

export const MilestoneSchema = z.object({
  year: z.string(),
  title: z.string(),
  blurb: z.string(),
});

export const PrincipleSchema = z.object({
  title: z.string(),
  description: z.string(),
  practice: z.string().optional(),
});

export const AboutDataSchema = z.object({
  milestones: z.array(MilestoneSchema),
  philosophy: z.array(PrincipleSchema),
  leadership: z.array(PrincipleSchema),
  education: z.object({
    school: z.string(),
    degree: z.string(),
    gpa: z.string(),
    start: z.string(),
    end: z.string(),
  }),
  certifications: z.array(z.string()),
  achievements: z.array(z.string()),
});

export const HiringDataSchema = z.object({
  experience: z.string(),
  targetRoles: z.string(),
  location: z.string(),
  relocation: z.string(),
  domains: z.string(),
  leadership: z.string(),
  coreStrengths: z.array(z.string()),
  coreStack: z.array(z.string()),
  highlights: z.array(z.string()),
  globalTeams: z.array(z.object({ company: z.string(), locations: z.array(z.string()) })),
  faq: z.array(z.object({ question: z.string(), answer: z.string(), meta: z.string() })),
});

const QualitySectionSchema = z.object({
  heading: z.string(),
  label: z.string().optional(),
  body: z.array(z.string()).optional(),
  bullets: z.array(z.string()).optional(),
  table: z
    .object({ caption: z.string(), columns: z.array(z.string()), rows: z.array(z.array(z.string())) })
    .optional(),
});

export const QualityDataSchema = z.object({
  statement: z.object({ heading: z.string(), body: z.array(z.string()), pillars: z.array(z.string()) }),
  metrics: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      context: z.string().optional(),
      shows: z.string(),
      evidence: z.string(),
      source: z.string(),
    })
  ),
  caseStudies: z.array(
    z.object({
      slug: z.string(),
      eyebrow: z.string(),
      title: z.string(),
      summary: z.string(),
      notice: z.string().optional(),
      url: z.string(),
      sections: z.array(QualitySectionSchema),
    })
  ),
});

export const MentoringDataSchema = z.object({
  url: z.string(),
  pageUrl: z.string(),
  audiences: z.array(z.object({ title: z.string(), body: z.string() })),
  topics: z.array(z.string()),
  sessions: z.array(z.object({ name: z.string(), format: z.string(), length: z.string(), free: z.boolean() })),
});

export const PostMetaSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  date: z.string(),
  readTimeMinutes: z.number(),
});

export const PostSchema = PostMetaSchema.extend({
  content: z.string(),
});

export const ContactMessageSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(1).max(4000),
  // Honeypot: a field real visitors never see or fill. Deliberately unconstrained here —
  // a max(0) would make Zod itself reject a filled one with a 400, which is exactly the
  // distinguishable response messages.ts's own check is designed to avoid giving a bot.
  website: z.string().max(500).optional(),
});

export const VisitLocationSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  country: z.string(),
  city: z.string(),
  count: z.number(),
});

export const VisitsResponseSchema = z.array(VisitLocationSchema);

export type VisitLocation = z.infer<typeof VisitLocationSchema>;

export type Profile = z.infer<typeof ProfileSchema>;
export type ExperienceEntry = z.infer<typeof ExperienceEntrySchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type SkillsData = z.infer<typeof SkillsDataSchema>;
export type AboutData = z.infer<typeof AboutDataSchema>;
export type PostMeta = z.infer<typeof PostMetaSchema>;
export type Post = z.infer<typeof PostSchema>;
