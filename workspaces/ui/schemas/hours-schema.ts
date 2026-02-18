import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

// --- TABLES ---


export const projects = sqliteTable('project', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    hourlyRate: real('hourly_rate').notNull().default(0.0),
    status: text('status', { enum: ['active', 'completed', 'archived'] }).default('active'),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

export const timeEntries = sqliteTable('time_entry', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    description: text('description'),
    startTime: text('start_time').notNull(),
    endTime: text('end_time'),
    durationMinutes: integer('duration_minutes').default(0),
    isBilled: integer('is_billed', { mode: 'boolean' }).default(false),
    effectiveRate: real('effective_rate').notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
}, (table) => [
    index('proj_time_idx').on(table.projectId),
    index('billed_status_idx').on(table.isBilled), // Fast filtering for "Unbilled" reports
]);

// --- RELATIONS ---


export const projectsRelations = relations(projects, ({ many }) => ({
    timeEntries: many(timeEntries),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
    project: one(projects, {
        fields: [timeEntries.projectId],
        references: [projects.id],
    }),
}));