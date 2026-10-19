import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "語音提醒小工具",
		short_name: "語音提醒",
		description: "用說的建立提醒，到點寄信提醒你",
		start_url: "/",
		display: "standalone",
		background_color: "#3BBC69",
		theme_color: "#FAF9F6",
		icons: [
			{
				src: "/icon-192.png",
				sizes: "192x192",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/icon-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/icon-maskable-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "maskable",
			},
		],
	}
}
