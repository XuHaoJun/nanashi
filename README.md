# Nanashi - 納納西傳說
類型：卡片養成對戰

平台：網頁遊戲

  遊戲背景設定在一個人類，獸人與各種魔物共存的異世界，遊戲中玩家扮演
故事主角：納納西。目的是為了征服這個充滿冒險與挑戰世界，達成統一，玩家
在遊戲開始會組織自己的公會（牌庫）並招募隊友，跟著隊友一日一日增加並成
長茁壯，並克服一次次的挑戰，來達成納納西的野心。

# [Try it online!](http://nanashi.herokuapp.com)

# Prerequisites

- [PostgreSQL](http://www.postgresql.org/)
- [redis](http://redis.io/)
- [mongoDB](https://www.mongodb.org/)

# Usage

```bash
# download nanashi server.
git clone https://github.com/XuHaoJun/nanashi.git
# change to nanashi directory.
cd nanashi
# install library.
npm install
# import sql file to PostgreSQL.
psql YOUR_DATABASE_NAME USER_NAME < ./sql-files/main.sql

# download nanashi client at same directory.
cd ..
git clone https://github.com/XuHaoJun/nanashiClient.git
# generate client
cd nanashiClient
npm install && npm run build
# download client assets(fonts, images, sounds.....).
wget https://dl.dropboxusercontent.com/u/36276771/nanashiClient_assets.tar.xz
tar xf nanashiClient_assets.tar.xz
cp -r nanashiClient_assets/* dist
rm -rf nanashiClient_assets

# back to project directory.
cd ../nanashi
# run and you must configure and start sql, redis, mongoDB.
npm start
```
