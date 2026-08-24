## Task 1: Project V2、原生契約與遷移（0.1.18）

**Files:**
- Create: `src/domain/contracts/outline.ts`
- Create: `src/domain/contracts/cast.ts`
- Create: `src/domain/contracts/art.ts`
- Create: `src/domain/contracts/script.ts`
- Create: `src/domain/contracts/storyboard.ts`
- Create: `src/domain/project-v2.ts`
- Create: `src/domain/migration.ts`
- Test: `src/domain/project-v2.test.ts`
- Test: `src/domain/migration.test.ts`
- Modify: `src/domain/project.ts`
- Modify: `src/storage/project-store.ts`
- Modify: `src/sidepanel/main.tsx`
- Modify: `package.json`, `public/manifest.json`, `manifest.json`

**Interfaces:**
- Produces: `ProjectDocumentV2`, `VersionHistory<T>`, `migrateProjectV1(input): ProjectDocumentV2`, five Zod schemas.
- Consumes: existing `ProjectDocument` only as migration input.

- [ ] **Step 1: Write failing contract and migration tests**

```ts
it("preserves five native documents without flattening", () => {
  const project = createProjectV2("Test");
  expect(project.schemaVersion).toBe("2.0");
  expect(Object.keys(project.documents)).toEqual(["outline", "cast", "art", "script", "storyboard"]);
});

it("backs up and migrates v1 stable ids", () => {
  const migrated = migrateProjectV1(v1Fixture);
  expect(migrated.migration?.sourceSchemaVersion).toBe("1.0");
  expect(migrated.assets.entities.some(x => x.id === "char-1")).toBe(true);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/domain/project-v2.test.ts src/domain/migration.test.ts`  
Expected: FAIL because `createProjectV2` and `migrateProjectV1` do not exist.

- [ ] **Step 3: Implement exact V2 core types**

```ts
export type VersionEntry<T> = { version: number; createdAt: string; source: "ai" | "human" | "migration"; data: T };
export type VersionHistory<T> = { currentVersion: number | null; stale: boolean; entries: VersionEntry<T>[] };
export type ProjectDocuments = {
  outline: VersionHistory<OutlineDocument>;
  cast: VersionHistory<CastDocument>;
  art: VersionHistory<ArtDocument>;
  script: VersionHistory<ScriptDocument>;
  storyboard: VersionHistory<StoryboardDocument>;
};
export interface ProjectDocumentV2 {
  schemaVersion: "2.0";
  project: ProjectMetadata;
  documents: ProjectDocuments;
  assets: AssetRepositoryIndex;
  flow: FlowWorkspaceState;
  jobs: FlowJobRecord[];
  migration?: { sourceSchemaVersion: "1.0"; sourceBackup: unknown };
}
```

- [ ] **Step 4: Make import/export and IndexedDB accept V2 and preserve a V1 backup**

Implement `parseProject(raw)` as: parse JSON → return V2 if schema 2.0 → validate and call `migrateProjectV1` if 1.0 → reject every other schema. Never mutate the parsed input.

- [ ] **Step 5: Remove hard-coded footer version**

Read `chrome.runtime.getManifest().version` in extension mode and `package.json`-injected `__APP_VERSION__` in Vite preview, so future version increments cannot leave the footer stale.

- [ ] **Step 6: Verify and bump version**

Run: `npm test && npm run typecheck && npm run build`  
Expected: all tests pass and `dist/manifest.json` reports `0.1.18`.

