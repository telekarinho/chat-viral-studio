# AI Contracts

## Principles
- structured outputs first
- schema validation on every generation
- prompt versioning
- workspace-scoped memory
- user edits are first-class feedback
- no promise of virality

## ContentItem contract
```json
{
  "title": "string",
  "pillar": "string",
  "format": "thought|main_video|story|broll",
  "duration_seconds": 12,
  "hook_options": ["string"],
  "script": "string",
  "screen_text": "string",
  "caption": {
    "instagram": "string",
    "tiktok": "string",
    "facebook": "string",
    "youtube_shorts": "string"
  },
  "hashtags": ["string"],
  "cta": "string",
  "recording_suggestions": [
    {
      "scene": "string",
      "duration_seconds": 3,
      "location_hint": "string"
    }
  ],
  "narrative": {
    "e": "string",
    "mas": "string",
    "por_isso": "string"
  }
}
```

## Repetition guard
Before generation:
1. retrieve recent content fingerprints
2. compare topic, metaphor, hook form, key phrase and CTA
3. if similarity exceeds configurable threshold, ask model for a different angle
4. record both rejected and accepted generation metadata

## Learning loop
Create -> Publish -> Measure -> Learn -> Adjust -> Repeat.
Recommendations are experiments, not guarantees.
