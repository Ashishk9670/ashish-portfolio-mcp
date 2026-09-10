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
});

export const AboutDataSchema = z.object({
  milestones: z.array(MilestoneSchema),
  philosophy: z.array(PrincipleSchema),
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

export type Profile = z.infer<typeof ProfileSchema>;
export type ExperienceEntry = z.infer<typeof ExperienceEntrySchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type SkillsData = z.infer<typeof SkillsDataSchema>;
export type AboutData = z.infer<typeof AboutDataSchema>;
export type PostMeta = z.infer<typeof PostMetaSchema>;
export type Post = z.infer<typeof PostSchema>;
