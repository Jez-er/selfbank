CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'cash' NOT NULL,
	`currency` text NOT NULL,
	`opening_balance_minor` integer DEFAULT 0 NOT NULL,
	`color` text DEFAULT '#64748b' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `accounts_archived_idx` ON `accounts` (`archived`,`sort_order`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer,
	`amount_minor` integer NOT NULL,
	`period` text DEFAULT 'monthly' NOT NULL,
	`start_month` text NOT NULL,
	`rollover` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "budget_amount_positive" CHECK("budgets"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE INDEX `budget_category_idx` ON `budgets` (`category_id`,`active`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`icon` text DEFAULT 'circle' NOT NULL,
	`color` text DEFAULT '#64748b' NOT NULL,
	`parent_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `categories_kind_idx` ON `categories` (`kind`,`archived`);--> statement-breakpoint
CREATE TABLE `debts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`counterparty` text NOT NULL,
	`direction` text NOT NULL,
	`principal_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`due_date` text,
	`note` text,
	`settled_at` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quote` text NOT NULL,
	`rate_to_base` real NOT NULL,
	`as_of` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	CONSTRAINT "fx_rate_positive" CHECK("exchange_rates"."rate_to_base" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fx_quote_date_unq` ON `exchange_rates` (`quote`,`as_of`);--> statement-breakpoint
CREATE INDEX `fx_lookup_idx` ON `exchange_rates` (`quote`,`as_of`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`target_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`target_date` text,
	`account_id` integer,
	`note` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `recurring_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`account_id` integer NOT NULL,
	`to_account_id` integer,
	`category_id` integer,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`note` text,
	`frequency` text NOT NULL,
	`interval_count` integer DEFAULT 1 NOT NULL,
	`day_of_month` integer,
	`weekday` integer,
	`month_of_year` integer,
	`start_date` text NOT NULL,
	`end_date` text,
	`next_run_at` text NOT NULL,
	`auto_post` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_posted_at` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "recurring_amount_positive" CHECK("recurring_rules"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE INDEX `recurring_due_idx` ON `recurring_rules` (`active`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`account_id` integer NOT NULL,
	`to_account_id` integer,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`to_amount_minor` integer,
	`base_amount_minor` integer NOT NULL,
	`fx_rate` real DEFAULT 1 NOT NULL,
	`category_id` integer,
	`goal_id` integer,
	`debt_id` integer,
	`recurring_id` integer,
	`occurred_at` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recurring_id`) REFERENCES `recurring_rules`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "tx_amount_positive" CHECK("transactions"."amount_minor" > 0),
	CONSTRAINT "tx_transfer_shape" CHECK(("transactions"."type" = 'transfer' AND "transactions"."to_account_id" IS NOT NULL AND "transactions"."to_account_id" <> "transactions"."account_id")
          OR ("transactions"."type" <> 'transfer' AND "transactions"."to_account_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `tx_occurred_idx` ON `transactions` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `tx_account_idx` ON `transactions` (`account_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `tx_to_account_idx` ON `transactions` (`to_account_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `tx_category_idx` ON `transactions` (`category_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `tx_type_idx` ON `transactions` (`type`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `tx_goal_idx` ON `transactions` (`goal_id`);--> statement-breakpoint
CREATE INDEX `tx_debt_idx` ON `transactions` (`debt_id`);