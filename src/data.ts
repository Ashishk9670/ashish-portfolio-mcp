import {
  AboutDataSchema,
  ExperienceEntrySchema,
  PostMetaSchema,
  PostSchema,
  ProfileSchema,
  ProjectSchema,
  SkillsDataSchema,
} from "./schemas";
import { z } from "zod";

const BASE_URL = "https://ashishk9670.github.io/portfolio/data";
const CACHE_TTL_SECONDS = 300;

async function fetchJson(path: string): Promise<unknown> {
  const url = `${BASE_URL}/${path}`;
  const response = await fetch(url, { cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true } });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function getProfile() {
  return ProfileSchema.parse(await fetchJson("profile.json"));
}

export async function getExperience() {
  return z.array(ExperienceEntrySchema).parse(await fetchJson("experience.json"));
}

export async function getProjects() {
  return z.array(ProjectSchema).parse(await fetchJson("projects.json"));
}

export async function getSkills() {
  return SkillsDataSchema.parse(await fetchJson("skills.json"));
}

export async function getAbout() {
  return AboutDataSchema.parse(await fetchJson("about.json"));
}

export async function listPosts() {
  return z.array(PostMetaSchema).parse(await fetchJson("posts.json"));
}

export async function getPost(slug: string) {
  return PostSchema.parse(await fetchJson(`posts/${slug}.json`));
}
