import * as Migrator from "effect/sql/Migrator";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import {
  DATABASE_MIGRATION_PROGRESS_MESSAGE,
  DATABASE_MIGRATIONS_FINISHED_MESSAGE,
  DATABASE_MIGRATIONS_STARTED_MESSAGE,
} from "@f4code/shared/databaseMigrationLog";
import { reconcileV2PreviewMigration } from "./reconcileV2PreviewMigration.ts";

import Migration001 from "./Migrations/001_OrchestrationEvents.ts";
import Migration002 from "./Migrations/002_OrchestrationCommandReceipts.ts";
import Migration003 from "./Migrations/003_CheckpointDiffBlobs.ts";
import Migration004 from "./Migrations/004_ProviderSessionRuntime.ts";
import Migration005 from "./Migrations/005_Projections.ts";
import Migration006 from "./Migrations/006_ProjectionThreadSessionRuntimeModeColumns.ts";
import Migration007 from "./Migrations/007_ProjectionThreadMessageAttachments.ts";
import Migration008 from "./Migrations/008_ProjectionThreadActivitySequence.ts";
import Migration009 from "./Migrations/009_ProviderSessionRuntimeMode.ts";
import Migration010 from "./Migrations/010_ProjectionThreadsRuntimeMode.ts";
import Migration011 from "./Migrations/011_OrchestrationThreadCreatedRuntimeMode.ts";
import Migration012 from "./Migrations/012_ProjectionThreadsInteractionMode.ts";
import Migration013 from "./Migrations/013_ProjectionThreadProposedPlans.ts";
import Migration014 from "./Migrations/014_ProjectionThreadProposedPlanImplementation.ts";
import Migration015 from "./Migrations/015_ProjectionTurnsSourceProposedPlan.ts";
import Migration016 from "./Migrations/016_CanonicalizeModelSelections.ts";
import Migration017 from "./Migrations/017_ProjectionThreadsArchivedAt.ts";
import Migration018 from "./Migrations/018_ProjectionThreadsArchivedAtIndex.ts";
import Migration019 from "./Migrations/019_ProjectionSnapshotLookupIndexes.ts";
import Migration020 from "./Migrations/020_AuthAccessManagement.ts";
import Migration021 from "./Migrations/021_AuthSessionClientMetadata.ts";
import Migration022 from "./Migrations/022_AuthSessionLastConnectedAt.ts";
import Migration023 from "./Migrations/023_ProjectionThreadShellSummary.ts";
import Migration024 from "./Migrations/024_BackfillProjectionThreadShellSummary.ts";
import Migration025 from "./Migrations/025_CleanupInvalidProjectionPendingApprovals.ts";
import Migration026 from "./Migrations/026_CanonicalizeModelSelectionOptions.ts";
import Migration027 from "./Migrations/027_ProviderSessionRuntimeInstanceId.ts";
import Migration028 from "./Migrations/028_ProjectionThreadSessionInstanceId.ts";
import Migration029 from "./Migrations/029_ProjectionThreadDetailOrderingIndexes.ts";
import Migration030 from "./Migrations/030_ProjectionThreadShellArchiveIndexes.ts";
import Migration031 from "./Migrations/031_AuthAuthorizationScopes.ts";
import Migration032 from "./Migrations/032_AuthPairingProofKeyThumbprint.ts";
import Migration033 from "./Migrations/033_ProjectionThreadsSettled.ts";
import Migration034 from "./Migrations/034_ProjectionThreadsSnoozed.ts";
import Migration035 from "./Migrations/035_ProjectionThreadTitleRegeneration.ts";
import Migration036 from "./Migrations/036_ProjectionThreadsPinned.ts";
import Migration037 from "./Migrations/037_ProjectionTurnsKeysetIndex.ts";
import Migration038 from "./Migrations/038_ProjectionThreadsPinOrderKey.ts";
import Migration039 from "./Migrations/039_ProjectionProjectsDefaultThreadEnvMode.ts";
import Migration040 from "./Migrations/040_ProjectionProjectFaviconPath.ts";
import Migration041 from "./Migrations/041_AuthSessionClientConnection.ts";
import Migration042 from "./Migrations/042_ProjectionThreadLinkedPullRequest.ts";
import Migration043 from "./Migrations/043_ProjectionThreadsUnsettledAt.ts";
import Migration044 from "./Migrations/044_ClearAutomaticProjectModelDefaults.ts";
import Migration045 from "./Migrations/045_ProjectionProjectsAutoPull.ts";
import Migration046 from "./Migrations/046_RepairAutomaticSettlementTimestamps.ts";
import Migration047 from "./Migrations/047_ProjectionProjectIcon.ts";
import Migration048 from "./Migrations/048_ProjectionThreadBranchPullRequest.ts";
import Migration049 from "./Migrations/049_ProjectionThreadsActiveOrderKey.ts";
import Migration050 from "./Migrations/050_ProjectionThreadPullRequests.ts";
import Migration051 from "./Migrations/051_ProjectionThreadMessageContext.ts";
import Migration052 from "./Migrations/052_ProjectionThreadTitleState.ts";
import Migration053 from "./Migrations/053_PullRequestFilesViewed.ts";
import Migration054 from "./Migrations/054_ProjectionThreadsAutoSettleDisabledAt.ts";
import Migration055 from "./Migrations/055_OrchestrationV2.ts";
import Migration056 from "./Migrations/056_RemoveRedundantProjectionIndexes.ts";
import Migration057 from "./Migrations/057_ScheduledTaskWebhooks.ts";
import Migration058 from "./Migrations/058_WebhookRelayDeliveries.ts";
import Migration059 from "./Migrations/059_McpAppModelContext.ts";
import Migration060 from "./Migrations/060_ThreadSnapshotWindowIndexes.ts";
import Migration061 from "./Migrations/061_PullRequestReviewGuides.ts";
import Migration062 from "./Migrations/062_ThreadFailureLookupIndex.ts";
import Migration063 from "./Migrations/063_DropUnusedV1Projections.ts";
import Migration064 from "./Migrations/064_CanonicalizeThreadPullRequestLinks.ts";
import Migration065 from "./Migrations/065_CodexUsageNativeTurnIndex.ts";
import Migration066 from "./Migrations/066_RepairClientSettlementTimestamps.ts";
import Migration067 from "./Migrations/067_WebhookDedupe.ts";
import Migration068 from "./Migrations/068_ShellStopRequestIndex.ts";
import Migration069 from "./Migrations/069_ThreadMessageSearch.ts";
import Migration070 from "./Migrations/070_PeerLinks.ts";
import Migration071 from "./Migrations/071_PeerLinkFence.ts";
import Migration072 from "./Migrations/072_WaitingLinkRequestIndex.ts";
import Migration073 from "./Migrations/073_ActiveTurnItemIndexes.ts";
import Migration074 from "./Migrations/074_ExcludeAttachmentPlaceholdersFromSearch.ts";
import Migration075 from "./Migrations/075_SubagentDeliveryState.ts";
import Migration076 from "./Migrations/076_ProjectionProjectsPinArchive.ts";
import Migration077 from "./Migrations/077_RepairBooleanSettledOverride.ts";
import Migration078 from "./Migrations/078_DropOrchestrationEventCorrelationIndex.ts";
import Migration079 from "./Migrations/079_DelegatedRecoveryIndexes.ts";
import Migration080 from "./Migrations/080_ScheduledTaskThreadMode.ts";
import Migration103 from "./Migrations/103_ProjectionMessageSearchText.ts";
import Migration104 from "./Migrations/104_TurnItemConversationIndex.ts";
import Migration105 from "./Migrations/105_CommandReadIndexes.ts";
import Migration106 from "./Migrations/106_LastExecutedRunIndex.ts";
import Migration107 from "./Migrations/107_TurnItemCounts.ts";
import Migration108 from "./Migrations/108_QueuedTurnInputIndex.ts";
import Migration109 from "./Migrations/109_ProjectionProjectsCustomTitle.ts";
import Migration110 from "./Migrations/110_TurnItemTypeStatusIndex.ts";
import Migration111 from "./Migrations/111_ShellThreadReadIndexes.ts";
import Migration112 from "./Migrations/112_AuthConnectDevices.ts";
import Migration113 from "./Migrations/113_AuthConnectDeniedRequests.ts";
import Migration114 from "./Migrations/114_QueuedTurnInputIndexJsonValid.ts";
import Migration115 from "./Migrations/115_ProviderTurnAttemptIndex.ts";
import Migration116 from "./Migrations/116_TurnItemMessageOrdinalIndex.ts";
import Migration117 from "./Migrations/117_TurnItemInlineWorkOutput.ts";
import Migration118 from "./Migrations/118_RepairStaleTitleRegeneration.ts";
import Migration119 from "./Migrations/119_IssueTrackerBindings.ts";
import Migration120 from "./Migrations/120_ActiveShellIndexIndexes.ts";
import Migration121 from "./Migrations/121_BackgroundRecoveryIndexes.ts";
import Migration122 from "./Migrations/122_TurnStartReadIndexes.ts";
import Migration123 from "./Migrations/123_DelegatedTaskReadIndexes.ts";
import Migration124 from "./Migrations/124_ThreadItemCounts.ts";
import Migration125 from "./Migrations/125_InferenceDiagnostics.ts";
import Migration081 from "./Migrations/081_InferenceRequests.ts";
import Migration082 from "./Migrations/082_InferenceRequestRouting.ts";
import Migration126 from "./Migrations/126_IssueTrackerAdditionalScopes.ts";
import Migration127 from "./Migrations/127_ProjectionProjectsTrackedFolders.ts";
import Migration128 from "./Migrations/128_TaskFolders.ts";
import Migration129 from "./Migrations/129_WorktreePathKeyIndex.ts";
import Migration130 from "./Migrations/130_DeferredSlashCommandIndex.ts";
import Migration132 from "./Migrations/132_IssueTrackerAccounts.ts";
import Migration133 from "./Migrations/133_Workflows.ts";
import Migration134 from "./Migrations/134_SupersededRunAttemptIndex.ts";
import Migration135 from "./Migrations/135_LayoutCommandApprovals.ts";
import Migration136 from "./Migrations/136_WorkflowSkippedRuns.ts";
import Migration137 from "./Migrations/137_WorkflowRunIndexes.ts";
import Migration138 from "./Migrations/138_WorkflowRunTags.ts";

const migrationEntries = [
  [1, "OrchestrationEvents", Migration001],
  [2, "OrchestrationCommandReceipts", Migration002],
  [3, "CheckpointDiffBlobs", Migration003],
  [4, "ProviderSessionRuntime", Migration004],
  [5, "Projections", Migration005],
  [6, "ProjectionThreadSessionRuntimeModeColumns", Migration006],
  [7, "ProjectionThreadMessageAttachments", Migration007],
  [8, "ProjectionThreadActivitySequence", Migration008],
  [9, "ProviderSessionRuntimeMode", Migration009],
  [10, "ProjectionThreadsRuntimeMode", Migration010],
  [11, "OrchestrationThreadCreatedRuntimeMode", Migration011],
  [12, "ProjectionThreadsInteractionMode", Migration012],
  [13, "ProjectionThreadProposedPlans", Migration013],
  [14, "ProjectionThreadProposedPlanImplementation", Migration014],
  [15, "ProjectionTurnsSourceProposedPlan", Migration015],
  [16, "CanonicalizeModelSelections", Migration016],
  [17, "ProjectionThreadsArchivedAt", Migration017],
  [18, "ProjectionThreadsArchivedAtIndex", Migration018],
  [19, "ProjectionSnapshotLookupIndexes", Migration019],
  [20, "AuthAccessManagement", Migration020],
  [21, "AuthSessionClientMetadata", Migration021],
  [22, "AuthSessionLastConnectedAt", Migration022],
  [23, "ProjectionThreadShellSummary", Migration023],
  [24, "BackfillProjectionThreadShellSummary", Migration024],
  [25, "CleanupInvalidProjectionPendingApprovals", Migration025],
  [26, "CanonicalizeModelSelectionOptions", Migration026],
  [27, "ProviderSessionRuntimeInstanceId", Migration027],
  [28, "ProjectionThreadSessionInstanceId", Migration028],
  [29, "ProjectionThreadDetailOrderingIndexes", Migration029],
  [30, "ProjectionThreadShellArchiveIndexes", Migration030],
  [31, "AuthAuthorizationScopes", Migration031],
  [32, "AuthPairingProofKeyThumbprint", Migration032],
  [33, "ProjectionThreadsSettled", Migration033],
  [34, "ProjectionThreadsSnoozed", Migration034],
  [35, "ProjectionThreadTitleRegeneration", Migration035],
  [36, "ProjectionThreadsPinned", Migration036],
  [37, "ProjectionTurnsKeysetIndex", Migration037],
  [38, "ProjectionThreadsPinOrderKey", Migration038],
  [39, "ProjectionProjectsDefaultThreadEnvMode", Migration039],
  [40, "ProjectionProjectFaviconPath", Migration040],
  [41, "AuthSessionClientConnection", Migration041],
  [42, "ProjectionThreadLinkedPullRequest", Migration042],
  [43, "ProjectionThreadsUnsettledAt", Migration043],
  [44, "ClearAutomaticProjectModelDefaults", Migration044],
  [45, "ProjectionProjectsAutoPull", Migration045],
  [46, "RepairAutomaticSettlementTimestamps", Migration046],
  [47, "ProjectionProjectIcon", Migration047],
  [48, "ProjectionThreadBranchPullRequest", Migration048],
  [49, "ProjectionThreadsActiveOrderKey", Migration049],
  [50, "ProjectionThreadPullRequests", Migration050],
  [51, "ProjectionThreadMessageContext", Migration051],
  [52, "ProjectionThreadTitleState", Migration052],
  [53, "PullRequestFilesViewed", Migration053],
  [54, "ProjectionThreadsAutoSettleDisabledAt", Migration054],
  // Preserve this migration's schema. Future V2 schema changes need new migrations.
  [55, "OrchestrationV2", Migration055],
  [56, "RemoveRedundantProjectionIndexes", Migration056],
  [57, "ScheduledTaskWebhooks", Migration057],
  [58, "WebhookRelayDeliveries", Migration058],
  [59, "McpAppModelContext", Migration059],
  [60, "ThreadSnapshotWindowIndexes", Migration060],
  [61, "PullRequestReviewGuides", Migration061],
  [62, "ThreadFailureLookupIndex", Migration062],
  [63, "DropUnusedV1Projections", Migration063],
  [64, "CanonicalizeThreadPullRequestLinks", Migration064],
  [65, "CodexUsageNativeTurnIndex", Migration065],
  [66, "RepairClientSettlementTimestamps", Migration066],
  [67, "WebhookDedupe", Migration067],
  [68, "ShellStopRequestIndex", Migration068],
  [69, "ThreadMessageSearch", Migration069],
  [70, "PeerLinks", Migration070],
  [71, "PeerLinkFence", Migration071],
  [72, "WaitingLinkRequestIndex", Migration072],
  [73, "ActiveTurnItemIndexes", Migration073],
  [74, "ExcludeAttachmentPlaceholdersFromSearch", Migration074],
  [75, "SubagentDeliveryState", Migration075],
  [76, "ProjectionProjectsPinArchive", Migration076],
  [77, "RepairBooleanSettledOverride", Migration077],
  [78, "DropOrchestrationEventCorrelationIndex", Migration078],
  [79, "DelegatedRecoveryIndexes", Migration079],
  [80, "ScheduledTaskThreadMode", Migration080],
  // Existing fork databases have already recorded these two IDs.
  [81, "InferenceRequests", Migration081],
  [82, "InferenceRequestRouting", Migration082],
  [103, "ProjectionMessageSearchText", Migration103],
  [104, "TurnItemConversationIndex", Migration104],
  [105, "CommandReadIndexes", Migration105],
  [106, "LastExecutedRunIndex", Migration106],
  [107, "TurnItemCounts", Migration107],
  [108, "QueuedTurnInputIndex", Migration108],
  [109, "ProjectionProjectsCustomTitle", Migration109],
  [110, "TurnItemTypeStatusIndex", Migration110],
  [111, "ShellThreadReadIndexes", Migration111],
  [112, "AuthConnectDevices", Migration112],
  [113, "AuthConnectDeniedRequests", Migration113],
  [114, "QueuedTurnInputIndexJsonValid", Migration114],
  [115, "ProviderTurnAttemptIndex", Migration115],
  [116, "TurnItemMessageOrdinalIndex", Migration116],
  [117, "TurnItemInlineWorkOutput", Migration117],
  [118, "RepairStaleTitleRegeneration", Migration118],
  [119, "IssueTrackerBindings", Migration119],
  [120, "ActiveShellIndexIndexes", Migration120],
  [121, "BackgroundRecoveryIndexes", Migration121],
  [122, "TurnStartReadIndexes", Migration122],
  [123, "DelegatedTaskReadIndexes", Migration123],
  [124, "ThreadItemCounts", Migration124],
  [125, "InferenceDiagnostics", Migration125],
  // Upstream numbers these 103-115; the fork already used those IDs, so the files are renumbered to match.
  [126, "IssueTrackerAdditionalScopes", Migration126],
  [127, "ProjectionProjectsTrackedFolders", Migration127],
  [128, "TaskFolders", Migration128],
  [129, "WorktreePathKeyIndex", Migration129],
  [130, "DeferredSlashCommandIndex", Migration130],
  [132, "IssueTrackerAccounts", Migration132],
  [133, "Workflows", Migration133],
  [134, "SupersededRunAttemptIndex", Migration134],
  [135, "LayoutCommandApprovals", Migration135],
  [136, "WorkflowSkippedRuns", Migration136],
  [137, "WorkflowRunIndexes", Migration137],
  [138, "WorkflowRunTags", Migration138],
] as const;

export const migrationManifest = migrationEntries.map(([id, name]) => [id, name] as const);

const makeMigrationLoader = (throughId?: number) =>
  Migrator.fromRecord(
    Object.fromEntries(
      migrationEntries
        .filter(([id]) => throughId === undefined || id <= throughId)
        .map(([id, name, migration]) => [`${id}_${name}`, migration]),
    ),
  );

const FIRST_V2_MIGRATION_ID = 55;

export function skippedV2Migrations(
  recorded: ReadonlyArray<{ readonly id: number; readonly name: string }>,
  throughId?: number,
): string[] {
  const latestRecordedId = Math.max(0, ...recorded.map((row) => row.id));
  const recordedNames = new Map(recorded.map((row) => [row.id, row.name]));
  return migrationManifest.flatMap(([id, name]) => {
    if (
      id < FIRST_V2_MIGRATION_ID ||
      id > latestRecordedId ||
      (throughId !== undefined && id > throughId)
    )
      return [];
    const recordedName = recordedNames.get(id);
    return recordedName === name ? [] : [`${id}_${name} (recorded: ${recordedName ?? "nothing"})`];
  });
}

// Migrators skip ids up to the highest recorded; reject collisions that would skip V2 schema.
const assertV2MigrationsCanRun = Effect.fn("assertV2MigrationsCanRun")(function* (
  throughId?: number,
) {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* sql`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'
  `;
  if (tables.length === 0) return;
  const recorded = yield* sql<{
    readonly migration_id: number;
    readonly name: string;
  }>`SELECT migration_id, name FROM effect_sql_migrations`;
  const skipped = skippedV2Migrations(
    recorded.map((row) => ({ id: row.migration_id, name: row.name })),
    throughId,
  );
  const latestRecordedId = Math.max(0, ...recorded.map((row) => row.migration_id));
  if (skipped.length === 0) return;
  return yield* new Migrator.MigrationError({
    kind: "BadState",
    message: `This database's migration history would skip required schema migrations: ${skipped.join(", ")}. The migrator skips every id up to the highest recorded id (${latestRecordedId}), regardless of name. It was probably written by a different build. Start the build that wrote it, or report this migration history so an upgrade path can be added.`,
  });
});

const latestMigrationId = Math.max(...migrationEntries.map(([id]) => id));

// Mirrors the Migrator, which runs only ids above the highest recorded, plus the V2-preview reconciliation.
export const hasPendingMigrations = Effect.fn("hasPendingMigrations")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* sql`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'
  `;
  if (tables.length === 0) return true;
  const rows = yield* sql<{ readonly latestId: number | null; readonly previewRows: number }>`
    SELECT
      MAX(migration_id) AS latestId,
      SUM(name = 'OrchestrationV2' AND migration_id IN (53, 54)) AS previewRows
    FROM effect_sql_migrations
  `;
  const row = rows[0];
  return (row?.latestId ?? 0) < latestMigrationId || (row?.previewRows ?? 0) > 0;
});

const run = Migrator.make({});

export interface RunMigrationsOptions {
  readonly toMigrationInclusive?: number | undefined;
}

export const runMigrations = Effect.fn("runMigrations")(function* ({
  toMigrationInclusive,
}: RunMigrationsOptions = {}) {
  // The desktop waits past its readiness budget until the finished line follows this one.
  const hasPending = yield* hasPendingMigrations();
  if (hasPending) yield* Effect.log(DATABASE_MIGRATIONS_STARTED_MESSAGE);
  const includesV2 =
    toMigrationInclusive === undefined || toMigrationInclusive >= FIRST_V2_MIGRATION_ID;
  // The reconcile takes the write lock; CLI startup must not contend with the server for a no-op.
  const previewMigrations = includesV2 && hasPending ? yield* reconcileV2PreviewMigration() : [];
  if (includesV2) {
    yield* assertV2MigrationsCanRun(toMigrationInclusive);
  }
  const sql = yield* SqlClient.SqlClient;
  const ledger = yield* sql`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'
  `;
  const [latest] =
    ledger.length === 0
      ? []
      : yield* sql<{
          readonly id: number | null;
        }>`SELECT MAX(migration_id) AS id FROM effect_sql_migrations`;
  const latestRecordedId = latest?.id ?? 0;
  const pending = migrationEntries.filter(
    ([id]) =>
      id > latestRecordedId && (toMigrationInclusive === undefined || id <= toMigrationInclusive),
  );
  // One transaction per migration: an index build on a large database can take minutes, and a
  // restart then resumes after the last finished migration instead of rolling all of them back.
  const executedMigrations: Array<readonly [id: number, name: string]> = [...previewMigrations];
  for (const [index, [id, name]] of pending.entries()) {
    if (latestRecordedId > 0) {
      yield* Effect.log(DATABASE_MIGRATION_PROGRESS_MESSAGE).pipe(
        Effect.annotateLogs({
          migration: `${id}_${name}`,
          progress: `${index + 1} of ${pending.length}`,
        }),
      );
    }
    executedMigrations.push(...(yield* run({ loader: makeMigrationLoader(id) })));
  }
  const migrations = executedMigrations.map(([id, name]) => `${id}_${name}`);
  yield* migrations.length === 0
    ? Effect.logDebug("Database schema is current")
    : Effect.log(DATABASE_MIGRATIONS_FINISHED_MESSAGE).pipe(Effect.annotateLogs({ migrations }));

  const recorded = yield* sql<{
    readonly migration_id: number;
    readonly name: string;
  }>`SELECT migration_id, name FROM effect_sql_migrations`;
  const manifestNames = new Map<number, string>(migrationEntries.map(([id, name]) => [id, name]));
  const divergent = recorded.flatMap((row) => {
    const expected = manifestNames.get(row.migration_id);
    if (expected === undefined) {
      return [`${row.migration_id}:${row.name} (unknown to this build)`];
    }
    return expected === row.name
      ? []
      : [`${row.migration_id}:${row.name} (this build: ${expected})`];
  });
  if (divergent.length > 0) {
    yield* Effect.logWarning(
      "Database migration history diverges from this build; recorded migration ids are skipped, not reconciled by name.",
    ).pipe(Effect.annotateLogs({ divergent }));
  }
  return executedMigrations;
});
