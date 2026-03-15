A single page react + postgres db(docker) + rsshub(docker) + express js + ollama(local LLM)

- Grab daily rss feed of different topic(world, hk, business, sports) from rthk, hk01 and yahoo hk periodically
- user can choose to subscribe different topic 
- Vectorize each article+title and topic, get top 15 related articles from each topic
- Generate overall summary using other article'summary with gemma:4b
- send email with overall summary+individual summary with source link


