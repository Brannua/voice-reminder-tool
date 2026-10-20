import { sql } from "drizzle-orm"
import {
	boolean,
	index,
	integer,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core"

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow(),
})

export const contacts = pgTable(
	"contacts",
	{
		id: varchar("id", { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		name: varchar("name", { length: 64 }).notNull(),
		email: varchar("email", { length: 255 }).notNull().default(""),
		is_self: boolean("is_self").notNull().default(false),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("contacts_name_idx").on(table.name)],
)

export const reminders = pgTable(
	"reminders",
	{
		id: varchar("id", { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		content: text("content").notNull(),
		recipient_name: varchar("recipient_name", { length: 64 }).notNull(),
		recipient_email: varchar("recipient_email", { length: 255 }).notNull(),
		remind_at: timestamp("remind_at", { withTimezone: true }).notNull(),
		status: varchar("status", { length: 16 }).notNull().default("pending"),
		sent_at: timestamp("sent_at", { withTimezone: true }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("reminders_status_remind_at_idx").on(table.status, table.remind_at),
		index("reminders_created_at_idx").on(table.created_at),
	],
)

export const settings = pgTable("settings", {
	key: varchar("key", { length: 64 }).primaryKey(),
	value: text("value").notNull(),
	updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
})

export const passwordResetCodes = pgTable(
	"password_reset_codes",
	{
		id: varchar("id", { length: 36 })
			.primaryKey()
			.default(sql`gen_random_uuid()`),
		email: varchar("email", { length: 255 }).notNull(),
		code_hash: varchar("code_hash", { length: 255 }).notNull(),
		expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
		consumed_at: timestamp("consumed_at", { withTimezone: true }),
		attempts: integer("attempts").notNull().default(0),
		locked_until: timestamp("locked_until", { withTimezone: true }),
		last_sent_at: timestamp("last_sent_at", { withTimezone: true }),
		reset_token_hash: varchar("reset_token_hash", { length: 255 }),
		reset_token_expires_at: timestamp("reset_token_expires_at", { withTimezone: true }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [uniqueIndex("password_reset_codes_email_idx").on(table.email)],
)
