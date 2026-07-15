// blogDb — shared helpers for DB-driven blog posts (published by newsletter-send).
// Hardcoded article components in BlogPost.tsx take priority; these are the
// weekly newsletter issues auto-published to the blog_posts table.
import React from "react";
import { supabase } from "./supabase";

export type DbPost = {
  slug: string;
  title: string;
  tag: string;
  description: string;
  body_md: string;
  published_at: string;
};

let cache: DbPost[] | null = null;

export async function getDbPosts(): Promise<DbPost[]> {
  if (cache) return cache;
  try {
    const { data, error } = await supabase
      .from("blog_posts")
      .select("slug, title, tag, description, body_md, published_at")
      .order("published_at", { ascending: false });
    if (error || !data) return [];
    cache = data as DbPost[];
    return cache;
  } catch {
    return [];
  }
}

export async function getDbPost(slug: string): Promise<DbPost | null> {
  const posts = await getDbPosts();
  return posts.find(p => p.slug === slug) ?? null;
}

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

export function readTime(md: string): string {
  const words = md.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200)) + " min read";
}

// Markdown renderer mirroring the newsletter-send edge fn rules:
// **bold**, [text](url), ## headings, - bullets, 1. numbered, paragraphs.
function inline(s: string, key: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on bold + links in one pass.
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) nodes.push(s.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(<strong key={key + "-b" + i}>{m[1]}</strong>);
    } else {
      nodes.push(
        <a key={key + "-a" + i} href={m[3]} style={{ color: "#ea6b14" }} target="_blank" rel="noopener noreferrer">
          {m[2]}
        </a>,
      );
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < s.length) nodes.push(s.slice(last));
  return nodes;
}

export function MdBody({ md }: { md: string }) {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: React.ReactNode[] = [];
  let items: React.ReactNode[] = [];
  let listTag: "ul" | "ol" | null = null;
  let para: string[] = [];
  let k = 0;

  const flushList = () => {
    if (items.length && listTag) {
      const L = listTag;
      out.push(L === "ul" ? <ul key={"l" + k++}>{items}</ul> : <ol key={"l" + k++}>{items}</ol>);
    }
    items = [];
    listTag = null;
  };
  const flushPara = () => {
    if (para.length) out.push(<p key={"p" + k++}>{inline(para.join(" "), k)}</p>);
    para = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); flushPara(); continue; }
    const num = line.match(/^\d+\.\s+(.*)$/);
    if (line.startsWith("- ")) {
      flushPara();
      if (listTag !== "ul") flushList();
      listTag = "ul";
      items.push(<li key={"i" + k++}>{inline(line.slice(2), k)}</li>);
    } else if (num) {
      flushPara();
      if (listTag !== "ol") flushList();
      listTag = "ol";
      items.push(<li key={"i" + k++}>{inline(num[1], k)}</li>);
    } else if (line.startsWith("## ")) {
      flushList(); flushPara();
      out.push(<h2 key={"h" + k++}>{inline(line.slice(3), k)}</h2>);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushList(); flushPara();
  return <>{out}</>;
}
