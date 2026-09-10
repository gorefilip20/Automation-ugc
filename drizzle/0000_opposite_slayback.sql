CREATE TABLE `avatar_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`prompt` text NOT NULL,
	`seed` int NOT NULL,
	`pose` varchar(80) NOT NULL,
	`wardrobe` varchar(120) NOT NULL,
	`identityLock` int NOT NULL DEFAULT 1,
	`ageConfirmed` int NOT NULL DEFAULT 1,
	`imageKey` varchar(255),
	`imageUrl` varchar(500),
	`status` enum('draft','generating','ready','failed') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `avatar_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `content_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`avatarProfileId` int,
	`title` varchar(180) NOT NULL,
	`kind` enum('image','caption','campaign','export') NOT NULL,
	`channel` varchar(40),
	`format` varchar(40),
	`body` text,
	`assetKey` varchar(255),
	`assetUrl` varchar(500),
	`disclosureStamp` varchar(180) NOT NULL DEFAULT 'AI-generated virtual creator',
	`status` enum('draft','ready','exported') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `content_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `creator_workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`creatorName` varchar(120) NOT NULL,
	`creatorBio` text NOT NULL,
	`persona` text NOT NULL,
	`voice` text NOT NULL,
	`visualAnchor` text NOT NULL,
	`disclosureEnabled` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `creator_workspaces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
