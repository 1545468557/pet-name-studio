#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从公开网页采集宠物名字，按宠物类型分类，输出 JSON（供 import-names.js 导入）。
用法: python3 scripts/scrape-names.py > /tmp/scraped_names.json
来源均为公开的名字大全/推荐页面，仅取名字本身（通用词汇，不含受版权保护的成段内容）。
"""
import urllib.request, gzip, re, json, sys

HDR = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
       "Accept-Encoding": "gzip"}

def get(url, retry=2):
    for i in range(retry):
        try:
            req = urllib.request.Request(url, headers=HDR)
            r = urllib.request.urlopen(req, timeout=25)
            d = r.read()
            if r.headers.get("Content-Encoding") == "gzip":
                d = gzip.decompress(d)
            return d.decode("utf-8", "ignore")
        except Exception as e:
            if i == retry - 1:
                print(f"[warn] {url} 失败: {e}", file=sys.stderr)
                return ""
            import time; time.sleep(1)

def to_text(html):
    t = re.sub(r"<script.*?</script>|<style.*?</style>|<noscript.*?</noscript>", " ", html, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    return t

# ---- 干扰词（导航/连接词/描述词；真实宠物名不入此表）----
EN_STOP = set("""The And For With Your You Our They This That These Those Names Name Meaning Meanings Best Top Most Popular Cute Cool Funny Unique Creative Adorable Beautiful Great More Click All Each Both Only Just Very Really Such Some Any Other Another One Two Three Four Five Six Seven Eight Nine Ten Old New Good Bad Fun Little Big Small First Last Next Prev Previous Home Contact About Privacy Policy Terms Menu Skip Content Search Shop Buy Now Read Blog News Subscribe Login Register Sign User Account Email Password Title Page Pages Site Website Online Web Article Articles Ideas Idea List Lists Tips Guide Guides Tip How What Why When Where Who Whom Whose Which If Else Then Than Its It Him Her His Hers Them Their Me My Mine Us Ours We I He She Be Am Is Are Was Were Been Being Have Has Had Do Does Did Will Would Shall Should Can Could May Might Must Need Needs Use Using Make Makes Made Take Takes Gave Given Getting Go Goes Went Gone Come Comes Came Coming See Sees Saw Seen Looking Watch Watches Watched Watching Say Says Said Telling Speak Speaks Spoke Spoken Talk Talks Talked Talking Think Thinks Thought Knowing Want Wants Wanted Feeling Feel Feels Felt Like Likes Liked Liking Find Finds Found Finding Keep Keeps Kept Keeping Put Puts Putting Set Sets Setting Leave Leaves Left Leaving Work Works Worked Working Play Plays Played Playing Live Lives Lived Living Eat Eats Ate Eaten Eating Sleep Sleeps Slept Sleeping Run Runs Ran Running Walk Walks Walked Walking Jump Jumps Jumped Jumping Swim Swims Swam Swum Swimming Fly Flies Flew Flown Flying Sing Sings Sang Sung Singing Dance Dances Danced Dancing Love Loves Loved Loving Hate Hates Hated Hating Show Shows Showed Showing Save Saves Saved Saving Share Shares Shared Sharing Follow Follows Followed Following Comment Comments Reply Replies Answer Question FAQ Table Row Col Width Height Size Type Kind Form File Open Close Free Price Offer Sale Cart Check Select Choose Option Result Query Term Word Words Letters Text Content Header Footer Side Menu Bar Link Links Item Items Group Groups Tag Tags Label Labels Updated Published Posted Author Date Year Month Day Time Min Sec Trending Favorite Style Styles Category Categories Collection Collections Inspiration Trend Rank Ranking Rating Review Story Stories Version Version Feature Features Mode Modes Setting Settings Reset Restore Backup Copy Paste Cut Edit Undo Redo Print Export Import Public Private Secret Hidden Visible Enable Disable Allow Block Deny Accept Reject Confirm Cancel OK Okay Yes No True False On Off In Out Up Down Left Right Center Middle Front Back Side Inside Outside Above Below Near Far Here There Where When Why How What Which Pet Pets Dog Dogs Cat Cats Puppy Puppies Kitten Kittens Rabbit Rabbits Bunny Bunnies Hamster Hamsters Bird Birds Parrot Parrots Animal Animals Male Female Girl Boy Gender Breed Breeds Color Colors Colour Colours White Black Blue Green Red Yellow Pink Purple Brown Gray Grey Orange Dark Light Snowy White Black Blue Green Red Yellow Pink Purple Brown Gray Grey Orange Dark Light Sparkle Shiny Golden Silver Bright Glow Glowing Shimmer Shimmering Classic Modern Trendy Fashionable Stylish Chic Famous Trending Viral Legend Legendary Myth Mythical Mythology God Gods Goddess Hero King Queen Prince Princess Lord Lady Knight Warrior Soldier Fighter Champion Winner Leader Captain Major General Officer Doctor Nurse Teacher Student Students Kids Children Baby Babies Man Men Woman Women Gentleman Lady Friend Friends Buddy Pal Mate Companion Partner Family Families Garden Gardens Park Parks Beach Ocean Sea River Lake Mountain Forest Wood Tree Trees Flower Flowers Plant Leaf Nature Natural Sweet Nice Great Amazing Awesome Perfect Wonderful Fantastic Excellent Lovely Charming Elegant Graceful Gentle Kind Friendly Happy Joyful Lucky Brave Strong Powerful Smart Clever Wise Funny Silly Quirky Weird Odd Strange Crazy Wild Calm Quiet Peaceful Serene Tranquil Bright Sparkling Social Media Facebook Instagram Twitter Youtube Google Amazon Apple Microsoft Sniffspot Los Angeles San Francisco York United States State City Country World Global Local Community Member Members User Users Admin Account Location Distance Miles Km Budget Plan Premium Trial Demo Download Upload Install Setup Configure Config Feature Full Wid Widow Faqs Read Also Mexican Turtle Ultimate Guide Naming Shelled Friend Whether Whether Names Based Movies Books Seasonal Every Year Choosing Teach Name FAQ How Do I Choose What Are Some Good Can Change Adoption Most Unique Should Similar Conclusion Which Bringing New Bunny Exciting Perfect First Fun Tasks Any Owner Personality Match Your Personality Popular Which Rabbit Most New Bunnies Sweet Cuddly Mischievous Outdoor Timeless Unusual Special Pairs Bonded Colors Markings Famous Movies Books Time Tips Perfect How Teach Their Trending Pick Pickle Pickles Food Inspired Specific Capture Culture Flavor Spirit Mexican Basics Majestic Seasonal Outdoor Timeless Unusual Special Pairs Bonded Markings Famous Choosing Teach FAQ Similar Conclusion Which Most New Bunnies Sweet Cuddly Mischievous Every Year Time Tips Perfect Color Colors Coat Markings Look Fur Ideas Water Air Earth Fire Wood Metal Stone Gem Gems Jewel Jewels Crystal Crystals""".split())

CN_STOP = set("的了就是我你他她它们这那之乎者也与和及或是但而且因为所以如果然后还是会有没不要在给把被让从向对着往呢吗啊哦呀哈啦吧么一个一些一种什么怎么为什么这些那些这个那个比如例如其中以及以上以下没有不是不最很都也再又才就只还并并且尤其甚至几乎几乎")
CN_BAD = ("名字 起名 取名 推荐 大全 选择 什么 怎么 通过 这样 那样 因为 所以 如果 但是 就是 不是 也是 还有 其中 以及 比如 例如 包括 或者 而是 而且 并且 甚至 非常 特别 十分 真的 其实 当然 主要 基本 完全 任何 每个 一直 始终 永远 只有 只要 只是 还是 然后 之后 以前 现在 目前 正在 马上 立刻 突然 当时 这里 那里 这些 那些 其他 其它 另外 此外 除了 无论 不管 即使 虽然 然而 尽管 既然 假如 就算 哪怕 即便 宁可 与其 不如 除非 万一 果然 居然 确实 的确 尤其 反而 至于 关于 对于 针对 相对 绝对 相比 相较 对比 比较 高贵 大气 优雅 聪明 勇敢 活泼 温柔 漂亮 帅气 高冷 粘人 调皮 乖巧 懂事 听话 安静 慵懒 傲娇 时尚 潮流 经典 完美 独特 好看 好听 顺口 简单 好记 个性 高级 清冷 治愈 儒雅 端庄 冷门 小众 高冷 可爱 阳光 元气 呆萌 软萌 俏皮".split())
CN_BAD_SET = set(CN_BAD)

# 整词删除（IP 衍生/非名字词）
DROP_EN = set("Life Paw Patrol Care Bears Bun Toy Angry Cheer Pro Beaks Beak Pick""".split())

def clean_en(s):
    return re.sub(r"[^A-Za-z]", "", s)

# ---- 解析器 ----
def parse_en_meaning(text):
    """名字 Meaning: 释义"""
    out = []
    for m in re.finditer(r"([A-Z][A-Za-z]{1,14})\s+Meaning:\s*([A-Za-z][^.]{8,160}[.])", text):
        nm, mean = m.group(1), m.group(2).strip()
        if nm not in EN_STOP and len(nm) >= 3:
            out.append((nm, mean))
    return out

def parse_sniffspot(text):
    out = []
    for m in re.finditer(r"NAME:\s*([A-Za-z]{3,15})\s+([A-Za-z][^.]{8,160}[.])", text):
        nm, mean = m.group(1), m.group(2).strip()
        if nm not in EN_STOP:
            out.append((nm, mean))
    return out

def parse_en_cluster(text):
    """连续大写词簇：列表区的名字是 'AAA BBB CCC' 相邻大写词（相邻间距<=3 非字母字符）"""
    seen, out = set(), []
    words = [(m.group(0), m.start(), m.end()) for m in re.finditer(r"[A-Z][a-z]{2,11}", text)]
    i = 0
    while i < len(words):
        j = i
        while j + 1 < len(words) and words[j + 1][1] - words[j][2] <= 3:
            j += 1
        if j - i + 1 >= 3:
            for k in range(i, j + 1):
                nm = words[k][0]
                if nm not in EN_STOP and nm not in seen:
                    seen.add(nm); out.append(nm)
        i = j + 1
    return [(nm, "") for nm in out]

def parse_table_first_col(text):
    """表格首列名字：| Bianca | An Italian name meaning ..."""
    out = []
    for m in re.finditer(r"\|\s*([A-Za-z]{3,15})\s*\|", text):
        nm = m.group(1)
        if nm not in EN_STOP and len(nm) >= 3:
            out.append((nm, ""))
    return out

def parse_cn_list(text):
    """顿号/逗号分隔的中文词"""
    seen, out = set(), []
    for m in re.finditer(r"([\u4e00-\u9fff]{2,6})(?:[、，,])", text):
        w = m.group(1)
        if any(c in CN_STOP for c in w) or w in seen:
            continue
        seen.add(w); out.append((w, ""))
    return out

def parse_cn_name_meaning(text):
    """名字：XX的宠物 带释义（冒号后可带空格）"""
    out = []
    for m in re.finditer(r"([\u4e00-\u9fff]{2,4})：\s*([\u4e00-\u9fff]{2,16}的[\u4e00-\u9fff]{1,4})", text):
        nm, mean = m.group(1), m.group(2)
        if any(c in CN_STOP for c in nm):
            continue
        out.append((nm, mean))
    return out

# ---- 风格推断 ----
FOOD = set("糖奶茶糕饼干饼包圆果蛋桃橘莓米豆薯酥布丁奶茶汤圆馒头饺子奥利奥泡芙麻薯板栗核桃栗子草莓西瓜芒果香蕉樱桃柚子奶昔奶盖芝士焦糖巧克力糯米元宵团子饭团年糕椰子花生芋泥肉松肉包汉堡香肠雪糕糖果蛋糕蛋挞爆米花可可可乐薯条蛋黄派披萨饼干")
BOSS = set("王霸虎豹狮将军元帅老大总裁老板大佬队长司令皇帝国王战士骑士超人大侠狼王金刚")
FUNNY = set("皮闹怪笨呆贱歪憨憨二狗铁蛋大壮翠花狗蛋胖虎猪头臭臭饭桶迷糊逗逗滑稽沙雕")
ANCIENT = set("云月星诗雅墨雪风山山川羽琴棋书画玉兰竹菊仙君子夜霜露晚朝清幽寂远溪谷烟霞琉璃翡翠琥珀玛瑙珊瑚珍珠")
ARTSY = set("书诗词文艺梦想光影蓝紫青白夜星辰海森野屿川凛初秋春夏冬雾雨虹")
SOFT = set("糯软绵绒柔萌圆圆球朵花云棉雪白甜甜暖")

def guess_styles(nm, mean=""):
    s = set()
    if any(c in FOOD for c in nm): s.add("food")
    if any(c in BOSS for c in nm): s.add("boss")
    if any(c in FUNNY for c in nm): s.add("funny")
    if any(c in ANCIENT for c in nm): s.add("ancient")
    if any(c in ARTSY for c in nm): s.add("artsy")
    if any(c in SOFT for c in nm): s.add("soft")
    if re.search(r"[A-Za-z]", nm): s.add("trendy")
    if not s: s.add("cute")
    return sorted(s)[:3]

def main():
    items, seen = [], set()

    def add(nm, mean, pet):
        nm = nm.strip()
        if not nm: return
        if re.search(r"[A-Za-z]", nm):
            if not (2 <= len(nm) <= 12): return
        else:
            if not (2 <= len(nm) <= 6): return
        if any(c in CN_STOP for c in nm): return
        if any(b in nm for b in CN_BAD_SET): return
        if nm in DROP_EN: return
        key = (nm, mean[:20])
        if key in seen: return
        seen.add(key)
        items.append({"n": nm, "m": mean[:100] if mean else "", "g": "any",
                      "s": guess_styles(nm, mean), "p": pet, "hot": False})

    # 猫（中文 + 英文）
    t = to_text(get("https://m.maigoo.com/goomai/240715.html"))
    for nm, _ in parse_cn_list(t): add(nm, "", "cat")
    t = to_text(get("https://m.sohu.com/a/889668888_100210538/"))
    for nm, _ in parse_cn_list(t): add(nm, "", "cat")
    t = to_text(get("https://meganicknames.com/names-for-cats/"))
    for nm, mean in parse_en_meaning(t): add(nm, mean, "cat")

    # 狗（英文：sniffspot Top 前 120 + meganicknames 320+）
    t = to_text(get("https://www.sniffspot.com/dog-names"))
    for i, (nm, mean) in enumerate(parse_sniffspot(t)):
        if i >= 120: break
        add(nm, mean, "dog")
    t = to_text(get("https://meganicknames.com/names-for-dogs/"))
    for nm, mean in parse_en_meaning(t): add(nm, mean, "dog")

    # 兔子（英文簇：nameznest + mypetinfoo）
    t = to_text(get("https://nameznest.com/rabbit-names/"))
    for nm, _ in parse_en_cluster(t): add(nm, "", "rabbit")
    t = to_text(get("https://mypetinfoo.com/creative-rabbit-names-for-first-time-owners/"))
    for nm, _ in parse_en_cluster(t): add(nm, "", "rabbit")

    # 仓鼠（英文带释义）
    t = to_text(get("https://nameoura.com/names-for-hamsters/"))
    for nm, mean in parse_en_meaning(t): add(nm, mean, "hamster")

    # 鸟（英文：chewy 表格首列 + pettakecare 簇 + nameoura 释义）
    t = to_text(get("https://www.chewy.com/education/bird/general/top-10-pet-bird-names"))
    for nm, _ in parse_table_first_col(t): add(nm, "", "bird")
    t = to_text(get("https://pettakecare.com/350-adorable-bird-names-youll-love/"))
    for nm, _ in parse_en_cluster(t): add(nm, "", "bird")
    t = to_text(get("https://nameoura.com/names-for-birds/"))
    for nm, mean in parse_en_meaning(t): add(nm, mean, "bird")

    # 中文综合（带释义）
    t = to_text(get("https://www.petopic.com/zh/blog/2025-nian-zui-liuxing-chongwu-mingzi-zhongwen"))
    for nm, mean in parse_cn_name_meaning(t): add(nm, mean, "any")

    json.dump(items, ensure_ascii=False, indent=1, fp=sys.stdout)
    print(f"\n# 共采集 {len(items)} 条", file=sys.stderr)

if __name__ == "__main__":
    main()
