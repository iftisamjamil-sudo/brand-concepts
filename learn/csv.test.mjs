import assert from "node:assert/strict";
import {
  filterVideos,
  findVideo,
  parseCsv,
  timestampToSeconds,
  videosFromCsv,
  youtubeAt,
} from "./csv.js";

const header =
  "video_id,title,channel,url,length,digest_date,thumbnail_url,summary_bullets,key_steps_timestamps,action_item,quiz_json,verdict,verdict_reason,worth_watching";

assert.deepEqual(videosFromCsv(header), []);
assert.deepEqual(videosFromCsv(`${header}\n`), []);
assert.deepEqual(videosFromCsv(""), []);
assert.deepEqual(videosFromCsv("\n\n"), []);

const csv = [
  header,
  [
    "abc123",
    "How to name a brand",
    "Studio North",
    "https://www.youtube.com/watch?v=abc123",
    "12:04",
    "2026-09-01",
    "",
    '"- Pick one promise\n- Say it in five words\n- Cut the extra line\n- Repeat it everywhere\n- Check it on a shelf\n- Ignore this sixth bullet"',
    '"0:35 - Promise\n2:10 — Five words\n[8:01] Shelf test\nJust a note"',
    '"Write the promise in one sentence."',
    '"[{""question"":""What do you cut?"",""answer"":""The extra line""},{""q"":""Where do you check it?"",""a"":""On a shelf""}]"',
    "Watch",
    '"Clear, usable"',
    "yes",
  ].join(","),
  [
    "short1",
    "A skip",
    "Other",
    "https://youtu.be/short1",
    "3:00",
    "",
    "https://i.ytimg.com/vi/short1/hqdefault.jpg",
    '"[""Only one point""]"',
    '"1m30s | Middle"',
    "",
    '"{""cards"":[{""front"":""Front"",""back"":""Back""}]}"',
    "Skip",
    "Thin",
    "no",
  ].join(","),
].join("\n");

const rows = parseCsv(csv);
assert.equal(rows.length, 3);
assert.ok(rows[1][7].includes("\n"));
assert.ok(!rows[1][7].includes('""'));

const videos = videosFromCsv(csv);
assert.equal(videos.length, 2);

const first = videos[0];
assert.equal(first.videoId, "abc123");
assert.equal(first.summaryBullets.length, 5);
assert.equal(first.summaryBullets[0], "Pick one promise");
assert.equal(first.summaryBullets[4], "Check it on a shelf");
assert.deepEqual(
  first.steps.map((step) => [step.seconds, step.label]),
  [
    [35, "Promise"],
    [130, "Five words"],
    [481, "Shelf test"],
    [null, "Just a note"],
  ]
);
assert.equal(youtubeAt(first.videoId, first.steps[1].seconds), "https://www.youtube.com/watch?v=abc123&t=130");
assert.equal(first.actionItem, "Write the promise in one sentence.");
assert.deepEqual(first.quiz, [
  { question: "What do you cut?", answer: "The extra line" },
  { question: "Where do you check it?", answer: "On a shelf" },
]);
assert.equal(first.worthWatching, true);
assert.equal(first.thumbnailUrl, "https://i.ytimg.com/vi/abc123/hqdefault.jpg");
assert.equal(first.verdictReason, "Clear, usable");

const second = videos[1];
assert.equal(second.worthWatching, false);
assert.equal(second.summaryBullets[0], "Only one point");
assert.equal(second.steps[0].seconds, 90);
assert.deepEqual(second.quiz, [{ question: "Front", answer: "Back" }]);
assert.equal(findVideo(videos, "short1").title, "A skip");
assert.equal(findVideo(videos, "missing"), null);

assert.equal(filterVideos(videos, { worthOnly: true }).length, 1);
assert.equal(filterVideos(videos, { query: "shelf" }).length, 1);
assert.equal(filterVideos(videos, { query: "skip", worthOnly: true }).length, 0);

assert.equal(timestampToSeconds("01:02:03"), 3723);
assert.equal(timestampToSeconds("1h2m3s"), 3723);
assert.equal(timestampToSeconds(90), 90);

const tricky = `${header}\n"id,with,comma","Title ""quoted""","Ch","https://www.youtube.com/watch?v=zzzzzz99","","","","","","","","",""\n`;
const parsedTricky = videosFromCsv(tricky);
assert.equal(parsedTricky[0].videoId, "id,with,comma");
assert.equal(parsedTricky[0].title, 'Title "quoted"');
assert.equal(youtubeAt(parsedTricky[0].videoId, 0), "https://www.youtube.com/watch?v=id%2Cwith%2Ccomma&t=0");

console.log("csv tests passed");
