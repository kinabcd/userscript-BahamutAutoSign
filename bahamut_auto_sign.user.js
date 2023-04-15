// ==UserScript==
// @name         巴哈姆特自動簽到（含公會、動畫瘋）
// @namespace    https://github.com/kinabcd/userscript-BahamutAutoSign
// @version      4.1.4.6
// @description  巴哈姆特自動簽到腳本
// @author       Kin Lo <kinabcd@gmail.com>
// @icon         https://www.gamer.com.tw/favicon.ico
// @match        https://*.gamer.com.tw/*
// @resource     popup_window https://raw.githubusercontent.com/kinabcd/userscript-BahamutAutoSign/master/popup_window.html
// @grant        GM_getResourceText
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      www.gamer.com.tw
// @connect      guild.gamer.com.tw
// @connect      ani.gamer.com.tw
// @connect      home.gamer.com.tw
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @supportURL   https://github.com/kinabcd/userscript-BahamutAutoSign/issues
// @noframes
// ==/UserScript==

(function () {
    'use strict';
    // 是否自動簽到公會？
    // option.signGuild
    initOption("option.signGuild", true);

    // 是否開啟每日動畫瘋作答？開啟則為每日題目出來會跳視窗可作答。
    // option.answerAnime
    initOption("option.answerAnime", true);

    // 將會自動獲取每日動畫瘋答案。
    // 會先採用 blackxblue 小屋創作的資訊 https://home.gamer.com.tw/creation.php?owner=blackxblue。
    // 若沒有，再搜尋非官方資料庫 https://home.gamer.com.tw/creationDetail.php?sn=3924920。
    // 請注意，答案不保證正確性，若當日答錯無法領取獎勵，我方或答案提供方並不為此負責。

    // ----------------------------------------------------------------------------------------------------

    // 程式開始
    setInterval(start, 3600000);
    setTimeout(start);

    function initOption(key, defaultValue) {
        GM_setValue(key, GM_getValue(key, defaultValue));
      }

    function start() {
        let today = new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Taipei" });
        let bahaId = undefined;

        try {
            bahaId = BAHAID;
            console.log("bas: ", "BAHAID from system", bahaId);
        } catch (error) {
            let cookie = document.cookie.split("; ").filter(cookie => cookie.startsWith("BAHAID")).shift();
            bahaId = cookie ? cookie.split("=").pop() : undefined;
            console.log("bas: ", "BAHAID from cookie", bahaId);
        }

        if (bahaId) {
            console.log("bas: ", "bahaId: ", bahaId);
        } else {
            console.error("bas: ", "No bahaId");
            if (GM_getValue("error_notify", null) !== today) {
                window.alert("自動簽到遇到問題，無法正常運作！（每天只會提醒一次，通常是沒登入造成問題，若已登入可能需重新登入。）");
                GM_setValue("error_notify", today);
            }
            return;
        }

        let lastDate = GM_getValue("record.lastDate", null);
        if (lastDate !== today) {
            console.log("bas: ", "日期已變更，重置紀錄");
            GM_setValue("record.mainSigned", []);
            GM_setValue("record.guildSigned", []);
            GM_setValue("record.animeAnswered", []);
            GM_setValue("record.lastDate", today);
        }

        // 每日簽到
        startDailySign(bahaId, today);
        // 公會簽到
        if (GM_getValue("option.signGuild", true)) {
            startGuildSign(bahaId, today);
        }

        // 動畫瘋題目
        if (GM_getValue("option.answerAnime", true)) {
            startAnswerAnime(bahaId, today);
        }
        readdAnswerAnimeButton(bahaId);
    }

    function readdAnswerAnimeButton(bahaId) {
        let topMenu = document.querySelector(".mainmenu ul");
        if (!topMenu) {
            console.error("bas: ", "找不到上方選單");
            return;
        }

        let oldLi = topMenu.querySelector(".auto_sign_button");
        if (oldLi) oldLi.remove();
        let newLi = document.createElement("li");
        newLi.classList.add("auto_sign_button");
        newLi.innerHTML = "<a href='#'>答題</a>";
        newLi.addEventListener("click", async ()=> {
            let today = new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Taipei" });
            let [year, month, date] = today.split("/").map(Number);
            let question = await getQuestion();
            if (!question.error) {
                manualAnswer(bahaId, question, month, date);
            } else {
                alert(question.msg);
            }
        });
        topMenu.appendChild(newLi);
    }

    /**
     * Start daily sign.
     * @returns {void} Nothing, just do it!
     */
    function startDailySign(bahaId, today) {
        console.log("bas: ", "開始每日簽到");
        let accounts_signed = GM_getValue("record.mainSigned", []);
        if (accounts_signed.includes(bahaId)) {
            console.log("bas: ", `${bahaId} 已經簽到過了，跳過簽到`);
            return;
        }

        submitDailySign().then(response => {
            if (response.data && response.data.days || response.error.code == 0 || response.error.message == "今天您已經簽到過了喔") {
                // 簽到成功或已簽到
                console.log("bas: ", "簽到成功！", response);
                let accounts_signed = GM_getValue("record.mainSigned", []);
                accounts_signed.push(bahaId);
                GM_setValue("record.mainSigned", accounts_signed);
            } else {
                console.error("bas: ", "簽到發生錯誤！", response);
            }
        });
    }

    // check
    // signed: {"days": 5, "signin": 1}
    // not signed: {"days": 0, "signin": 0}
    // not logged in: {"days": 0, "signin": 0}
    /**
     * 檢查每日簽到狀態
     * @returns {Promise} 伺服器回傳
     */
    function checkSign() {
        return new Promise(function (resolve) {
            GM_xmlhttpRequest({
                method: "POST",
                url: "https://www.gamer.com.tw/ajax/signin.php",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;",
                },
                data: "action=2",
                responseType: "json",
                cache: false,
                onload: data => resolve(data.response.data)
            });
        });
    }

    // sign
    // signed: {"code": 0, "message": "今天您已經簽到過了喔"}
    // not signed: {"days": 5, "dialog": ""}
    // not logged in: {code: 401, message: "尚未登入", status: "NO_LOGIN", details: []}
    /**
     * 送出每日簽到
     * @returns {Promise} 伺服器回傳
     */
    function submitDailySign() {
        return new Promise(function (resolve) {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://www.gamer.com.tw/ajax/get_csrf_token.php",
                cache: false,
                onload: token => GM_xmlhttpRequest({
                    method: "POST",
                    url: "https://www.gamer.com.tw/ajax/signin.php",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded;",
                    },
                    data: "action=1&token=" + token.response,
                    responseType: "json",
                    cache: false,
                    onload: data => resolve(data.response)
                })
            });
        });
    }

    /**
     * Fetch guild list from https://home.gamer.com.tw/joinGuild.php
     * @returns {Promise<Number[]>} Array of guild numbers.
     */
    function getGuilds() {
        console.log("bas: ", "獲取公會列表");
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://home.gamer.com.tw/joinGuild.php",
                cache: false,
                onload: html => {
                    let guilds = (html.response.match(/guild\.php\?gsn=(\d+)/g) || []).filter((v,i,a)=>a.indexOf(v)==i).map(it => it.replace("guild.php?gsn=","")).filter(value => !isNaN(value));
                    console.log("bas: ", "獲取到的公會列表: ", guilds);
                    resolve(guilds);
                }
            });
        });
    }

    /**
     * Start guild sign.
     * @returns {void} Nothing, just do it!
     */
    async function startGuildSign(bahaId, today) {
        console.log("bas: ", "開始公會簽到");

        let accounts_signed = GM_getValue("record.guildSigned", []);
        if (accounts_signed.includes(bahaId)) {
            console.log("bas: ", `${bahaId} 已經公會簽到過了，跳過簽到`);
            return;
        }

        let guilds = await getGuilds();
        Promise.all(guilds.map(submitGuildSign)).then(function (responses) {
            console.log("bas: ", "公會簽到結束", responses);
            let accounts_signed = GM_getValue("record.guildSigned", []);
            accounts_signed.push(bahaId);
            GM_setValue("record.guildSigned", accounts_signed);
        }, function (error) {
            console.error("bas: ", "簽到公會時發生錯誤。", error);
        });
    }

    // signed: {error: 1, msg: "您今天已經簽到過了！"}
    /**
     * 送出公會簽到
     * @param {Number} sn 公會編號
     * @returns {Promise} 伺服器回傳
     */
    function submitGuildSign(sn) {
        console.log("bas: ", `開始公會 ${sn} 簽到`);
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: "POST",
                url: "https://guild.gamer.com.tw/ajax/guildSign.php",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data: "sn=" + sn,
                cache: false,
                responseType: "json",
                onload: data => resolve(data.response),
                onerror: reject
            });
        });
    }

    // 動畫瘋答題由 maple3142/動畫瘋工具箱 支援：https://greasyfork.org/zh-TW/scripts/39136
    /**
     * 開始動畫瘋問題回答
     * @returns {void} Nothing, just do it!
     */
    async function startAnswerAnime(bahaId, today) {
        console.log("bas: ", "開始動畫瘋問題回答");
        let [year, month, date] = today.split("/").map(Number);
        let start_of_today = new Date(Date.UTC(year, month - 1, date - 1, 16));
        let accounts_answered = GM_getValue("record.animeAnswered", []);
        if (accounts_answered.includes(bahaId)) {
            console.log("bas: ", `${bahaId} 已經回答過動畫瘋問題了，跳過回答`);
            return;
        }


        let question = await getQuestion();
        if (question.error) {
            console.log("bas: ", "已作答過動畫瘋題目", question);
            recordAnsweredAccount(bahaId);
            return;
        }

        console.log("bas: ", "進入自動作答動畫瘋", question);
        let answer = await getAnswer(month, date).catch(console.error);
        console.log("bas: ", "自動作答獲取到答案為：", answer);
        if (answer) {
            submitAnswer(answer).then(result => {
                console.log("bas: ", "答案送出成功", result);
                recordAnsweredAccount(bahaId);
            }).catch(error => console.error("bas: ", "送出答案發生錯誤", error));
            return;
        }
    }

    function recordAnsweredAccount(bahaId) {
        let accounts_answered = GM_getValue("record.animeAnswered", []);
        accounts_answered.push(bahaId);
        GM_setValue("record.animeAnswered", accounts_answered);
    }

    /**
     * 獲取題目答案
     * @returns {Promise<Number | null>} 獲取到的答案
     */
    function getAnswer(month,date) {
        return new Promise(async function (resolve, reject) {
            let answer = await getAnswer_blackxblue(month,date).catch(async err => await getAnswer_DB().catch(console.error));
            console.log("bas: ", "獲取到答案為：", answer);
            if (answer) resolve(answer);
            else reject("No answer found.");
        });
    }

    /**
     * 從 blackxblue 創作獲取今日動畫瘋解答
     * @returns {Promise<Number>} If answer found, return answer.
     */
    function getAnswer_blackxblue(month,date) {
        return new Promise(function (resolve, reject) {
            var tpl = document.createElement('template');
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://home.gamer.com.tw/creation.php?owner=blackxblue",
                responseType: "text",
                onload: function (page) {
                    tpl.innerHTML = page.response;
                    var result = Array.from(tpl.content.querySelectorAll(".TS1"))
                        .find((v)=> v.innerText.includes(month.toString().padStart(2, '0') + "/" + date.toString().padStart(2, '0')))
                    if (result) {
                        console.log("bas: ", "從 blackxblue 小屋找到今日動畫瘋文章 ID：", result, result.getAttribute("href"));
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: "https://home.gamer.com.tw/" + result.getAttribute("href"),
                            responseType: "text",
                            onload: page => {
                                tpl.innerHTML = page.response;
                                let result = /A:(\d)/.exec(tpl.content.querySelector(".MSG-list8C, #article_content").textContent.replace(/\s/g, "").replace(/：/g, ":"));
                                if (result) {
                                    console.log("bas: ", "在創作中找到答案為：", result);
                                    resolve(result[1]);
                                } else {
                                    console.error("bas: ", "在創作中無法找到答案。");
                                    reject("No result found in post.");
                                }
                            }
                        });
                    } else {
                        console.error("bas: ", "沒有找到今日的創作。");
                        reject("No matched post found.");
                    }
                },
                onerror: reject
            });
        });
    }

    /**
     * 從資料庫獲取答案
     * @returns {Promise<Number>} If answer found, return answer.
     */
    function getAnswer_DB() {
        return new Promise(function (resolve, reject) {
            getQuestion().then(function (question) {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: "https://script.google.com/macros/s/AKfycbxYKwsjq6jB2Oo0xwz4bmkd3-5hdguopA6VJ5KD/exec?type=quiz&question=" + encodeURIComponent(question.question),
                    responseType: "json",
                    onload: function (response) {
                        if (response.response.success) {
                            resolve(response.response.message.answer);
                        } else {
                            reject();
                        }
                    },
                    onerror: reject
                });
            }).catch(reject);
        });
    }

    /**
     * 作答動畫瘋題目
     * @param {Number} answer 有效答案 1 - 4
     * @returns {Promise<Boolean>} 答案正確與否
     */
    function submitAnswer(answer) {
        return new Promise(function (resolve, reject) {
            console.log("bas: ", "送交答案中...", answer);
            getQuestion().then(question => {
                GM_xmlhttpRequest({
                    method: "POST",
                    url: "https://ani.gamer.com.tw/ajax/animeAnsQuestion.php",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded;",
                    },
                    data: "token=" + question.token + "&ans=" + answer + "&t=" + Date.now(),
                    responseType: "json",
                    cache: false,
                    onload: response => {
                        console.log("bas: ", "答案已送交！", response);
                        if (response.response.error || response.response.msg === "答題錯誤") {
                            console.error("bas: ", "答案錯誤！", response, response.response);
                            reject(response.response);
                        } else {
                            console.log("bas: ", "答案正確", response, response.response);
                            resolve(response.response);
                        }
                    }
                });
            }, reject);
        });
    }

    // not answered: { "game": "龍王的工作！", "question": "龍王的弟子是以下哪位?", "a1": "空銀子", "a2": "雛鶴愛", "a3": "水越澪", "a4": "貞任綾乃", "userid": "ww891113", "token": "01e0779c7298996032acdacac3261fac28d32e8bb44f4dda5badb111" }
    // answered: { "error": 1, "msg": "今日已經答過題目了，一天僅限一次機會" }
    /**
     * 獲取本日題目資料
     * @returns {JSON | Promise<JSON>} 題目資料
     */
    function getQuestion() {
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://ani.gamer.com.tw/ajax/animeGetQuestion.php?t=" + Date.now(),
                responseType: "json",
                cache: false,
                onload: data => {
                    resolve(data.response);
                },
                onerror: reject
            });
        });
    }

    /**
     * 跳出手動作答視窗
     * @param {JSON} question 題目資料
     * @returns {void} Nothing, just do it!
     */
    function manualAnswer(bahaId, question, month, date) {
        let tpl = document.createElement('template');
        tpl.innerHTML = GM_getResourceText("popup_window");
        let dialog = tpl.content.querySelector('.bas');
        let header = dialog.querySelector('.bas.popup.header')
        header.innerText = `${month}/${date} 動漫通`;

        dialog.querySelector('.bas.popup.question span').innerText = question.question;
        let option1 = dialog.querySelector('.bas.popup.option-1');
        option1.innerText = question.a1;
        option1.addEventListener("click", () => doAnswer(1));
        let option2 = dialog.querySelector('.bas.popup.option-2');
        option2.innerText = question.a2;
        option2.addEventListener("click", () => doAnswer(2));
        let option3 = dialog.querySelector('.bas.popup.option-3');
        option3.innerText = question.a3;
        option3.addEventListener("click", () => doAnswer(3));
        let option4 = dialog.querySelector('.bas.popup.option-4');
        option4.innerText = question.a4;
        option4.addEventListener("click", () => doAnswer(4));

        let author = dialog.querySelector('.bas.popup.author a');
        author.innerText = question.userid;
        author.setAttribute("href", `https://home.gamer.com.tw/${question.userid}`);

        dialog.querySelector(".bas.popup.accociated-anime span").innerText = question.game;
        dialog.querySelector("#bas-close").addEventListener("click", () => dialog.remove());

        function doAnswer(answer) {
            console.log("bas: ", "User input answer: ", answer);
            submitAnswer(answer).then((result) => {
                console.log("bas: ", result);
                console.log("bas: ", "作答成功！", result.gift);
                window.alert("作答成功！".concat(result.gift));
                recordAnsweredAccount(bahaId);
                dialog.remove();
            }, (err) => {
                console.log("bas: ", err);
                console.error("bas: ", "作答發生問題！", err.msg);
                window.alert(err.msg);
                dialog.remove();
            });
        }

        let bGetAnswer = dialog.querySelector("#bas-get-answer");
        bGetAnswer.addEventListener("click", () => {
            bGetAnswer.disabled = true;
            getAnswer(month, date).then(ans => {
                window.alert("獲取的答案可能是：" + ans);
                bGetAnswer.disabled = false;
            }, err => {
                window.alert("目前尚未有答案＞＜可至官方粉絲團尋找答案哦～");
                bGetAnswer.disabled = false;
            });
        });
        document.querySelector('body').appendChild(dialog)
    }
})();
