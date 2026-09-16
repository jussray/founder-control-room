# Operator Relay Next Gate

The next implementation gate is not another contract file.

It is to mount the relay route inside the canonical authenticated FCR runtime and provide real, separately configured adapters for Perplexity and Anthropic/Claude, while keeping ChatGPT/Codex as the current conversation/operator lane.

Do not silently proxy a requested operator through another model. If the exact requested operator runtime is unavailable, return `relay_target_unavailable`.

After mounting, prove one founder-issued `Tell Perplexity ...` request through the browser and capture the exact provider evidence reference on the returned response.
