import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAbout, getExperience, getHiring, getMentoring, getPost, getProfile, getProjects, getQuality, getSkills, listPosts } from "./data";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * Registers all portfolio tools on a McpServer instance. Shared between the
 * Cloudflare Worker (remote, Streamable HTTP/SSE) and the stdio entry point
 * (local, for Claude Desktop/Code) so both expose identical tools.
 */
export function registerPortfolioTools(server: McpServer) {
  server.registerTool(
    "get_experience",
    {
      title: "Get work experience",
      description:
        "Ashish Kumar's work experience history — company, role, dates, responsibilities, quantified results, and business impact for each position.",
    },
    async () => jsonResult(await getExperience())
  );

  server.registerTool(
    "get_projects",
    {
      title: "Get project case studies",
      description:
        "Ashish Kumar's project case studies: problem, approach, quantified results, outcome, and business impact for each project.",
    },
    async () => jsonResult(await getProjects())
  );

  server.registerTool(
    "get_skills",
    {
      title: "Get skills and tools",
      description:
        "Ashish Kumar's technical skills grouped by category, plus the actual tools he reaches for with a one-line rationale for each.",
    },
    async () => jsonResult(await getSkills())
  );

  server.registerTool(
    "get_about",
    {
      title: "Get background and philosophy",
      description:
        "Ashish Kumar's career timeline, engineering philosophy/principles, leadership and mentoring examples, education, certifications, and achievements.",
    },
    async () => jsonResult(await getAbout())
  );

  server.registerTool(
    "get_contact_info",
    {
      title: "Get contact info and availability",
      description:
        "How to contact Ashish Kumar (email, GitHub, LinkedIn, website) and whether he's currently available for new opportunities.",
    },
    async () => {
      const profile = await getProfile();
      return jsonResult({
        name: profile.name,
        role: profile.role,
        location: profile.location,
        email: profile.email,
        github: profile.github,
        linkedin: profile.linkedin,
        availableForOpportunities: profile.availableForOpportunities,
        // Tagged so visits that start from an AI assistant show up as their own source in site analytics.
        website: `${profile.siteUrl}/?utm_source=mcp`,
      });
    }
  );

  server.registerTool(
    "get_hiring_info",
    {
      title: "Get hiring logistics",
      description:
        "Ashish Kumar's target roles, notice period, location and relocation/visa situation, interview formats he's comfortable with, core strengths, domains, and the teams he has worked with across time zones.",
    },
    async () => jsonResult(await getHiring())
  );

  server.registerTool(
    "get_quality_metrics",
    {
      title: "Get quality metrics and case studies",
      description:
        "The quality metrics Ashish Kumar makes release decisions with (escaped defects, flaky-test rate, regression time, AI effectiveness, and more), each labeled with its source, plus his quality-engineering case studies.",
    },
    async () => jsonResult(await getQuality())
  );

  server.registerTool(
    "get_mentoring",
    {
      title: "Get mentoring and career guidance",
      description:
        "Career guidance Ashish Kumar offers to QA engineers and SDETs: who it's for, topics, session types (free ones marked), and the Topmate booking link.",
    },
    async () => jsonResult(await getMentoring())
  );

  server.registerTool(
    "list_blog_posts",
    {
      title: "List blog posts",
      description: "List Ashish Kumar's blog post titles, descriptions, and publish dates.",
    },
    async () => jsonResult(await listPosts())
  );

  server.registerTool(
    "get_blog_post",
    {
      title: "Get a blog post",
      description:
        "Get the full Markdown content of one of Ashish Kumar's blog posts by slug. Use list_blog_posts first to find valid slugs.",
      inputSchema: {
        slug: z.string().describe("The post's slug, e.g. 'wcag-2-1-aa-from-scratch'"),
      },
    },
    async ({ slug }) => jsonResult(await getPost(slug))
  );
}
