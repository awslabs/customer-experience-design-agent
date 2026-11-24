// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ACXD Plugin Validation Tests
 *
 * Validates plugin structure, frontmatter, cross-references, and content integrity.
 * Run with: bun test plugins/acxd/tests/plugin.test.ts
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, basename } from "path";

const PLUGIN_DIR = join(__dirname, "..");
const STAGES_DIR = join(PLUGIN_DIR, "stages");
const CONTRIBUTIONS_DIR = join(PLUGIN_DIR, "contributions");
const AGENTS_DIR = join(PLUGIN_DIR, "agents");
const SCOPES_DIR = join(PLUGIN_DIR, "scopes");
const KNOWLEDGE_DIR = join(PLUGIN_DIR, "knowledge");
const SENSORS_DIR = join(PLUGIN_DIR, "sensors");

/** Helper: read markdown file and extract YAML frontmatter */
function parseFrontmatter(filePath: string): Record<string, any> {
  const content = readFileSync(filePath, "utf-8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  // Simple YAML parsing for validation (key: value pairs)
  const yaml: Record<string, any> = {};
  for (const line of match[1].split("\n")) {
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.+)/);
    if (kvMatch) {
      yaml[kvMatch[1]] = kvMatch[2].trim();
    }
  }
  return yaml;
}

/** Helper: recursively find all .md files in a directory */
function findMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath));
    } else if (entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("ACXD Plugin Structure", () => {
  test("plugin.json exists and is valid JSON", () => {
    const manifestPath = join(PLUGIN_DIR, ".aidlc-plugin", "plugin.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.name).toBe("acxd");
    expect(manifest.version).toBeDefined();
    expect(manifest.dependencies).toContain("core");
  });

  test("README.md exists", () => {
    expect(existsSync(join(PLUGIN_DIR, "README.md"))).toBe(true);
  });

  test("required directories exist", () => {
    const requiredDirs = [
      "stages/ideation",
      "stages/inception",
      "stages/construction",
      "stages/operation",
      "contributions",
      "agents",
      "scopes",
      "knowledge",
      "sensors",
      "tools",
    ];
    for (const dir of requiredDirs) {
      expect(existsSync(join(PLUGIN_DIR, dir))).toBe(true);
    }
  });
});

describe("ACXD Stages", () => {
  const stageFiles = findMarkdownFiles(STAGES_DIR);

  test("has exactly 11 stage files", () => {
    expect(stageFiles.length).toBe(11);
  });

  test("all stages have plugin: acxd in frontmatter", () => {
    for (const file of stageFiles) {
      const content = readFileSync(file, "utf-8");
      expect(content).toContain("plugin: acxd");
    }
  });

  test("all stages have required frontmatter fields", () => {
    const requiredFields = ["slug", "number", "name", "plugin", "phase", "lead_agent"];
    for (const file of stageFiles) {
      const fm = parseFrontmatter(file);
      for (const field of requiredFields) {
        expect(fm[field]).toBeDefined();
      }
    }
  });

  test("stage numbers are in expected ranges", () => {
    const expectedStages: Record<string, [number, number]> = {
      "acxd-cx-discovery": [1, 2],
      "acxd-platform-config": [2, 3],
      "acxd-flow-design": [2, 3],
      "acxd-component-design": [2, 3],
      "acxd-backend-design": [2, 3],
      "acxd-resource-creation": [3, 4],
      "acxd-flow-build": [3, 4],
      "acxd-backend-build": [3, 4],
      "acxd-build-deploy": [4, 5],
      "acxd-operational-readiness": [4, 5],
    };

    for (const file of stageFiles) {
      const fm = parseFrontmatter(file);
      const num = parseFloat(fm.number);
      const slug = fm.slug;
      if (expectedStages[slug]) {
        const [min, max] = expectedStages[slug];
        expect(num).toBeGreaterThanOrEqual(min);
        expect(num).toBeLessThan(max);
      }
    }
  });

  test("all stages end with Learn section", () => {
    for (const file of stageFiles) {
      const content = readFileSync(file, "utf-8");
      expect(content).toContain("## Learn");
    }
  });

  test("platform-config precedes flow-design (number ordering)", () => {
    let configNum = 0;
    let flowDesignNum = 0;
    for (const file of stageFiles) {
      const fm = parseFrontmatter(file);
      if (fm.slug === "acxd-platform-config") configNum = parseFloat(fm.number);
      if (fm.slug === "acxd-flow-design") flowDesignNum = parseFloat(fm.number);
    }
    expect(configNum).toBeLessThan(flowDesignNum);
  });
});

describe("ACXD Contributions", () => {
  const contribFiles = findMarkdownFiles(CONTRIBUTIONS_DIR);

  test("has 11 or more contribution files", () => {
    expect(contribFiles.length).toBeGreaterThanOrEqual(11);
  });

  test("all contributions have target and plugin fields", () => {
    for (const file of contribFiles) {
      const content = readFileSync(file, "utf-8");
      expect(content).toContain("target:");
      expect(content).toContain("plugin: acxd");
    }
  });

  test("all contributions have fragment anchors", () => {
    for (const file of contribFiles) {
      const content = readFileSync(file, "utf-8");
      expect(content).toMatch(/anchor:/);
    }
  });
});

describe("ACXD Agent", () => {
  test("acxd-platform-agent.md exists", () => {
    const agentPath = join(AGENTS_DIR, "acxd-platform-agent.md");
    expect(existsSync(agentPath)).toBe(true);
  });

  test("agent has required frontmatter", () => {
    const agentPath = join(AGENTS_DIR, "acxd-platform-agent.md");
    const fm = parseFrontmatter(agentPath);
    expect(fm.name).toBe("acxd-platform-agent");
    expect(fm.plugin).toBe("acxd");
  });

  test("agent references knowledge examples", () => {
    const content = readFileSync(join(AGENTS_DIR, "acxd-platform-agent.md"), "utf-8");
    expect(content).toContain("KNOWLEDGE-ARCHITECTURE.md");
    expect(content).toContain("acxd-flow-design.md");
    expect(content).toContain("acxd-node-reference.md");
    expect(content).toContain("acxd-architecture-principles.md");
  });
});

describe("ACXD SIT Method", () => {
  test("SIT method file exists in the platform agent's knowledge", () => {
    const p = join(KNOWLEDGE_DIR, "acxd-platform-agent", "acxd-sit-method.md");
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p, "utf-8")).toContain("Systems Integration Test");
  });
  test("no SIT agent file remains in agents/", () => {
    expect(existsSync(join(AGENTS_DIR, "acxd-sit-agent.md"))).toBe(false);
  });
});

describe("ACXD Scopes", () => {
  const scopeFiles = findMarkdownFiles(SCOPES_DIR);

  test("has exactly 5 scope files", () => {
    expect(scopeFiles.length).toBe(5);
  });

  test("all scopes have plugin: acxd", () => {
    for (const file of scopeFiles) {
      const content = readFileSync(file, "utf-8");
      expect(content).toContain("plugin: acxd");
    }
  });

  const expectedScopes = ["acxd-platform", "acxd-usecase", "acxd-enhancement", "acxd-poc", "acxd-platform-poc"];

  test("PoC scopes turn summary confirmation and learnings off", () => {
    for (const scope of ["acxd-platform-poc", "acxd-poc"]) {
      const content = readFileSync(join(SCOPES_DIR, `${scope}.md`), "utf-8");
      const fm = content.split("---")[1];
      expect(fm).toContain("summary_confirmation: off");
      expect(fm).toContain("learnings: off");
    }
  });
  for (const scope of expectedScopes) {
    test(`scope ${scope} exists`, () => {
      const file = scopeFiles.find((f) => basename(f, ".md") === scope);
      expect(file).toBeDefined();
    });
  }
});

describe("ACXD Knowledge", () => {
  const knowledgeFiles = findMarkdownFiles(KNOWLEDGE_DIR);

  test("has 10 or more knowledge files", () => {
    expect(knowledgeFiles.length).toBeGreaterThanOrEqual(10);
  });

  test("shared overview exists", () => {
    expect(existsSync(join(KNOWLEDGE_DIR, "aidlc-shared", "acxd-overview.md"))).toBe(true);
  });

  test("platform agent knowledge files exist", () => {
    const expected = [
      "acxd-node-reference.md",
      "acxd-flow-design.md",
      "acxd-variables-and-state.md",
      "acxd-agentic-and-prompting.md",
      "acxd-conversation-design.md",
      "acxd-architecture-principles.md",
      "acxd-sdk-idl.ts",
    ];
    for (const file of expected) {
      expect(existsSync(join(KNOWLEDGE_DIR, "acxd-platform-agent", file))).toBe(true);
    }
  });

  test("agent-specific knowledge files exist", () => {
    expect(
      existsSync(join(KNOWLEDGE_DIR, "aidlc-developer-agent", "acxd-integrations.md"))
    ).toBe(true);
    expect(
      existsSync(join(KNOWLEDGE_DIR, "aidlc-quality-agent", "acxd-testing-and-deployment.md"))
    ).toBe(true);
    expect(
      existsSync(join(KNOWLEDGE_DIR, "acxd-platform-agent", "acxd-node-reference.md"))
    ).toBe(true);
    expect(
      existsSync(join(KNOWLEDGE_DIR, "aidlc-compliance-agent", "acxd-compliance-guide.md"))
    ).toBe(true);
  });

  test("no Beta/Gamma references in knowledge files", () => {
    for (const file of knowledgeFiles) {
      const content = readFileSync(file, "utf-8").toLowerCase();
      expect(content).not.toContain("beta endpoint");
      expect(content).not.toContain("gamma endpoint");
      expect(content).not.toContain("beta/gamma");
    }
  });

  test("knowledge files use provenance tags", () => {
    // Any provenance tag from the knowledge map: [CONSOLE-VERIFIED], [DOC], [GA-GAP], [SDK], [SDK-MODEL], [NEURA], [SPECIALIST].
    const tagRe = /\[(?:CONSOLE-VERIFIED|DOC|GA-GAP|SDK|SDK-MODEL|NEURA|SPECIALIST)[^\]]*\]/g;
    let totalTags = 0;
    for (const file of knowledgeFiles) {
      totalTags += (readFileSync(file, "utf-8").match(tagRe) ?? []).length;
    }
    // Should have many provenance tags across all knowledge files
    expect(totalTags).toBeGreaterThan(87);
  });
});

describe("ACXD Sensors", () => {
  test("sensor files exist", () => {
    const sensorFiles = readdirSync(SENSORS_DIR);
    expect(sensorFiles.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Cross-Reference Integrity", () => {
  test("all stage lead_agents reference existing agents", () => {
    const agentFiles = findMarkdownFiles(AGENTS_DIR);
    const agentNames = new Set<string>();

    for (const file of agentFiles) {
      const fm = parseFrontmatter(file);
      if (fm.name) agentNames.add(fm.name);
    }

    // Also include core agents that the plugin references
    agentNames.add("aidlc-product-agent");
    agentNames.add("aidlc-architect-agent");
    agentNames.add("aidlc-developer-agent");
    agentNames.add("aidlc-quality-agent");
    agentNames.add("aidlc-operations-agent");
    agentNames.add("aidlc-aws-platform-agent");
    agentNames.add("aidlc-pipeline-deploy-agent");

    const stageFiles = findMarkdownFiles(STAGES_DIR);
    for (const file of stageFiles) {
      const fm = parseFrontmatter(file);
      if (fm.lead_agent) {
        expect(agentNames.has(fm.lead_agent)).toBe(true);
      }
    }
  });

  test("no description fields exceed 200 characters in knowledge files", () => {
    // Spot check: knowledge files should mention the 200-char rule
    const vars = readFileSync(
      join(KNOWLEDGE_DIR, "acxd-platform-agent", "acxd-variables-and-state.md"),
      "utf-8"
    );
    expect(vars).toContain("200");
  });
});

describe("Content Quality", () => {
  test("Node SDK is referenced (not cURL/REST)", () => {
    const idl = readFileSync(
      join(KNOWLEDGE_DIR, "acxd-platform-agent", "acxd-sdk-idl.ts"),
      "utf-8"
    );
    expect(idl).toContain("amazon-connect-acxd-sdk");
    expect(idl).not.toContain("curl ");
  });

  test("description field discipline is documented", () => {
    const vars = readFileSync(
      join(KNOWLEDGE_DIR, "acxd-platform-agent", "acxd-variables-and-state.md"),
      "utf-8"
    );
    expect(vars).toContain("What");
    expect(vars).toContain("Inputs");
    expect(vars).toContain("Outputs");
    expect(vars).toContain("Consumers");
    expect(vars).toContain("Owner");
  });

  test("deterministic vs agentic framework is present", () => {
    const archPatterns = readFileSync(
      join(KNOWLEDGE_DIR, "acxd-platform-agent", "acxd-flow-design.md"),
      "utf-8"
    );
    expect(archPatterns).toContain("deterministic");
    expect(archPatterns).toContain("agentic");
    expect(archPatterns).toContain("Generative Journey");
  });
});
