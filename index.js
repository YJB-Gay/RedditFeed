require("dotenv").config();

const fs = require("fs");
const axios = require("axios");

// Define an array of subreddit objects with their corresponding thread IDs
const subreddits = [
    { name: "r/SalC1", threadId: "1196236674439589998" },
    { name: "r/2b2t_Uncensored", threadId: "1196236581850329200" },
    { name: "r/minecraftclients", threadId: "1196236494529114212" },
    { name: "r/MinecraftExploits", threadId: "1196236433774629046" },
    { name: "r/2b2t", threadId: "1196236623470399558" },
];

let lastPost;

if (fs.existsSync("last.dat")) {
    lastPost = JSON.parse(fs.readFileSync("last.dat").toString());
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}


function GetImageUrl(post) {
	if(post.media_metadata) {
		let id;
		if(post.gallery_data) {
			id = post.gallery_data.items[0].media_id;
		} else {
			id = Object.keys(post.media_metadata)[0];
		}
		
		let data = post.media_metadata[id];

		let url;
		if(data.e === "Image") {
			url = data.s.u
		} else if(data.e === "AnimatedImage") {
			url = data.s.gif;
		} else {
			console.error("wtf is this image", data.e, post.name);
			return null;
		}
		url = url.replaceAll("&amp;", "&");
		return url;
	} else if(post?.preview?.images?.[0]?.source?.url) {
		return post.preview.images[0].source.url.replaceAll("&amp;", "&");
	} else if(post.thumbnail_width != undefined && post.thumbnail_height != undefined) {
		if(post.crosspost_parent_list) {
			return GetImageUrl(post.crosspost_parent_list[0])
		} else {
			return post.url;
		}
	} else {
		return null;
	}
}

async function ProcessPost(post, subreddit) {
    let imageUrl = GetImageUrl(post);

    let embed = {
        title: `${subreddit.name} - ${post.title}`.substring(0, 256),
        description: post.selftext.substring(0, 512),
        url: `https://www.reddit.com${post.permalink}`,
        color: 0xFF5700,
        author: {
            name: `u/${post.author}`,
            url: `https://www.reddit.com/user/${post.author}`,
        },
        image: imageUrl ? {
            url: imageUrl,
        } : null,
    };

    try {
        // Append '?thread_id=' to the webhook URL
        await axios.post(`https://discordapp.com/api/webhooks/${process.env.WEBHOOK_ID}/${process.env.WEBHOOK_TOKEN}?thread_id=${subreddit.threadId}`, {
            embeds: [embed],
        });
        await sleep(2000);
    } catch (ex) {
        console.error("Failed to send post", embed, "because", ex.response.data);
    }
}

async function main() {
    let response;
    try {
        // Iterate through each subreddit
        for (const subreddit of subreddits) {
            response = await axios.get(`https://www.reddit.com/${subreddit.name}/new.json`);
            let posts = response.data.data.children;

            if (!lastPost[subreddit.name]) {
                lastPost[subreddit.name] = { date: posts[0].data.created, id: posts[0].data.name };
                continue;
            }

            let toSend = [];

            for (let post of posts) {
                if (post.data.name === lastPost[subreddit.name].id || post.data.created <= lastPost[subreddit.name].date) {
                    break;
                }
                toSend.push(post.data);
            }

            if (toSend.length > 0) {
                for (let post of toSend.reverse()) {
                    console.log(`Processing post for ${subreddit.name}`, post.name, "-", post.title);
                    await ProcessPost(post, subreddit);
                }

                lastPost[subreddit.name] = { date: toSend.at(-1).created, id: toSend.at(-1).name };
            }
        }
    } catch (ex) {
        console.error("Got error", ex?.message || ex);
    }

    fs.writeFileSync("last.dat", JSON.stringify(lastPost));
    setTimeout(main, 60 * 1000);
}

main();
