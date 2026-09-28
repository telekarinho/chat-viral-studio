# Database v1

All tenant-owned rows include workspace_id.

## Core identity
- workspaces
- workspace_members
- creator_profiles
- brand_kits

## Strategy
- content_pillars
- pillar_targets
- creator_goals
- creator_voice_rules

## Routine and planning
- routines
- routine_blocks
- content_plans
- content_items
- recording_tasks
- task_events

## Creation
- scripts
- hooks
- captions
- hashtags
- takes
- media_files
- upload_sessions

## Memory
- ai_memories
- content_fingerprints
- generation_runs

## Later phases
- video_projects
- video_clips
- templates
- publishing_targets
- published_posts
- metric_snapshots
- experiments
- notifications
- subscriptions
- audit_logs

## Key constraints
- pillar target percentages per strategy version should sum to 100
- task status is enum: pending, done, skipped, did_not_happen, rescheduled, alternate_scene
- media original records are immutable after successful ingest
- content_fingerprints are workspace scoped and used before generation
- soft delete for normal product entities; hard delete worker for privacy erasure
