# SPDX-FileCopyrightText: 2026 @misetteichan
# SPDX-License-Identifier: MIT

# clicker-chan_mod.3mf(穴・十字を埋めた素の土台)から生成したパラメトリックモデル。
# メッシュ(_DATA)は土台のみ。ボディの14x14角穴と足の十字穴は build() 内で
# CSG(ブール演算)で新規に開ける。既定値(穴14.0 / アーム厚1.18)で元の実績版と一致する。
# 穴・十字の位置と寸法は実績3MFから実測(2026-07)。座標は mm・Z-up。

import base64
import struct
import zlib

import numpy as np
from manifold3d import Manifold, Mesh

from app.model_api import Model, Param, Part

_PARTS = [
    ("ボディ", "#FF0000"),
    ("足", "#FF0000"),
    ("顔", "#000000"),
    ("表情", "#FFFFFF"),
]

# 穴(14x14角穴): X-Z断面は side x side。サイズ可変なので X-Z は中央基準(X=0,Z=-9.19)。
# Yは深さ固定なので「中央」ではなく、奥側(+Y)の面を固定位置(HOLE_Y_BACK)にして、
# そこから足側(-Y)方向へ HOLE_DEPTH ぶん伸ばす。
# → HOLE_DEPTH を増やすほど足側へ深く抜ける。サイズを変えても Y はズレない。
HOLE_XZ_CENTER = (0.0, -9.19)   # X中心, Z中心
HOLE_Y_BACK = 5.93              # Yの奥端(固定位置)
HOLE_DEPTH = 17.0               # 奥端から足側(-Y)へ伸ばす深さ
# 足の十字穴: 全長4.2mm固定・アーム厚可変・深さ3.5mm(Y方向)
CROSS_SPAN = 4.2
CROSS_DEPTH = 3.5
CROSS_CENTER = (0.03, -12.75, -9.82)

# ヒートン(吊り下げ用ネジ)下穴: 頭頂部(+Y面)の中央から -Y 方向へ。
# 直径0.8mm・深さ3.0mm。ボディ +Y面(Y=11.07)からわずかに外へ出して確実に開口させ、
# 材料内の深さはちょうど3.0mmになるよう入口をオーバーシュートさせる。
HEATON_DIAM = 0.8
HEATON_DEPTH = 3.0
HEATON_OVERSHOOT = 0.2
HEATON_SURFACE_Y = 11.07         # ボディ +Y 面
# 穴中心 (X, Z)。Zはボディ+顔を合わせた全体の中心(-9.87)。入口はボディ面内に収まる。
HEATON_XZ = (0.0, -9.87)

_DATA = (
    "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"
    "NDCXRlbz8eDDjc2X3cr7OKpmM3OrWAkfvzG0han1Wn4fDxzXynR58e8g8KXkRDO40Nc+Pnix"
    "jdm857SPf2zkmdlv7/fxt23uMVNXZPj4mdh7Tav+U328b2Z7M+J4ko8TtncwKe9H+/izqR1N"
    "yUvL2gDX+LOjkXZF1exkutTre1TkDQZ9dVTyj93eKCTleC0fCUn5s/5aFZLnzm/5Qkjqk13p"
    "eEjqOXz65ZDUv0fl30LSrmevx4alvVM7FA2LHkYuKR0W/QzcUiksels5u0ZY9Dm/YnxY9OxN"
    "rB8W/d8/qWFY7GIqNAqLvUTe4f5yufnzzS2VW87OcPHc8meWKZr73OwVBXPr81+NfLn1TLwW"
    "k1v/7Z9E5bara9G/w9LelZdvhUUPNZveCIt+GpW4Hha97Vv8XVj0uXH9tbDoOavDV2HRf/KW"
    "L8Nil4NPfRHO9cMOX4TFjpCLfZFf7I5yxB9QvvgJniv+g/qIX6Ge4m+ov/gh2iX+ifaK30IP"
    "4s/Qj/g59Cb+D31Kv4Cepb9A/9KPYJfg1SbJYi9nu9HKdqN9mzrbjfZt7Ww32vcBZ7vRvm84"
    "2432fcbZbrTvS852o30fc7Yb7fues91o3yed7Ub7vupsN9r3YWe70b5vO9uN9n3e2W603xec"
    "7Ub7fcTZbrTfd5ztRqu+Ntrva852Tu5s5/I727lynO1c+c527rnOdq4+znauns52rv7Odq5d"
    "znauvc52Tg/Odk4/znZOb852Tp/Odk7PznZO/852zi7OdqNVbBzt21Tyw9ZSDnxAyodvyHPh"
    "M1If+JLUEz4m9YfvSbvgk9Je+KroAT4s+oFvi97g86JP9AXRM/qI6B99R+wS6Wuj/b4mdoRc"
    "7Iv8YneUI/6A8sVP8FzxH9RH/Ar1FH9D/cUP0S7xT7RX/BZ6EH+GfsTPoTfxf+hT+gX0LP0F"
    "+pd+BLsEOn3m6/PN+CPhZs0W+G1fXWNDePnd//jyhmPzmWHRGKpHmxvNS5hi0xz+pWQlMynP"
    "n3451964y3xV/js//7S17+eWM3v4ImNxSPAb+d/286RvGm9m7Tjo4xlvTTHHZji84dLS8JUv"
    "Tvg4f73McGb2H64O6X+GpRzU7fXb5335qZyHzNFm7rm9vuhhxo90bXkgc6DxQjt9fPLpyeFJ"
    "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"
    "lOF8apxp0WZCs+SfozJCWKNHcOHkavWqhf9f7PKcTlh99H+xyyPyCC6c7H3dJbnV71+Gex5o"
    "lIuxfwBcNq600Rh5glM/zJULFrncKxjyv6rMT55YqXEynvXBkc7JY0rV83GFkV2Sm5ap5ePa"
    "s7omz29Q1ccfRt2f/NPgCj5ufr1b8gevlfbxQq9ncnJyCR+3vtU7+duooj4uka9fcqlAQYcn"
    "DExe2SWvjzfWHJK88mrAxxNrjEge9ex/QeDjw0cl3076y8f9Px6bPGjDbz6eMm9S8pbDv/i4"
    "QLcpycmvXPfxa62mJ9db8oOPf245J3lji+99jHZVP/6dj//etjBXXq7Gktz8kzKW5ZZz938r"
    "css/2TM197mrU1fl1idpz+rcej67e21u/b9fuj63XWMTM3Lbe+HNzFw9NKuyKVc/n3TcnKu3"
    "5cGncvU5PHpLrp6/WbklV/+FPt+Sa5e6/2zJtRfkk2vdmZv/+RqtcssZWLRNpPxP2uY+t9CC"
    "Drn12fJXl9x6/taqe279T97VO7ddPX7qmyzt7dFnYLLooe6owcmin88qDEsWvTWeOCJZ9Jn6"
    "4MPJouc2n41MFv13+n1UsthlVdboZLHX6QsOw44ih30lP+wu5cAfpHz4iTwX/iP1gV9JPeFv"
    "Un/4obQL/inthd+KHuDPoh/4uejN93/qE/1C9Iz+IvpHPxK7bFjUOddeEZwTjOTJCUbuzQlG"
    "yswJRp6VE4zUIScYqVtOMFLnnGCkLRbntjEnGGl7TjCik5xgRFc5wYgOc4IR3eYEIzrPCUZs"
    "kROM2CgnGLFdTjBi05xgxNY5wYgP5AQjvpETjPhMTjDiSznBiI/lBCO+lxOM+GROMOKrOcGI"
    "D+cEI76dE4z4fE4w0hdygpE+khOM9J2cYKRP5QQjfc3JXR90+V3fdOW4Psvy/b7snuv6uKuP"
    "6/uuni4muPq7WOHa5WKIa6+LLU4PLuY4/bhY5PTmYpTTp4tdTs8upjn9u1jn7OJioLOXi43O"
    "jiKPxFJndyknEnudn8hzI7Ha+ZXUMxLbnR9KuyJjgfNb0UNk7HB+LnqLjDWuX4ieI2OT60di"
    "l8hYlhOMv34+LGOcYIx9wDI+Ckae4uc658oFi1zuFQx55rKF4Qo7W/v9en2e+eE/a0f7+Gbh"
    "OWHvjMP3Vp8evu9rN0bs7T0l/PcjsT5et3tS+MG+brwItBgX3rUrv4+fvzUqPHRIIReTfx8R"
    "vmuSGzu6eUPDd10o7vDHD4ZNSikfP3myf3jdynI+DpfsG/7hnUo+ftT0Ds+5p7qLb+d7hjd9"
    "V9vHI7r3CDc+UN/HfVt1D19+OsHHcendwqWzm7vY1a9bbrsgr7Y3mJu/74vtcsvJv7FTpPxR"
    "9+c+97WivXLr03lx39x6Pv3WwNz6T3lzSG67/pk+Ire9/34+MlcPH914JFc/Kc+Oy9XbJ39N"
    "yNXn3d9MytXzd2Mfy9X/b/Mn59olqf7jPoa9po1weFORJbny11Yuy81fNLAyt5yLo1Nzyx95"
    "eFXucxP+WJ1bn5wy63Lr2b7Mhtz6L7+Rkduugs9szG3vE4025+rh3NKncvUzbd+WXL3F78zK"
    "1WfU2K25el58a2uu/nd2zs61y4mR2bn2glzsiPxiX5QjdvfLpz/gueInqI/4D+opfoX6i7+h"
    "XeKHaK/4J/Qgfgv9iD9Db+Ln0Kf4P/Qs/QL6l/4Cu0g/gr2OXI/6v9qYE4y0PScY0UlOMKIr"
    "2/dzdZgTjOg2JxjReU4wYoucYMRGNobn2i4nGLFpTjBi65xgxAdyghHfyAlGfCYnGPElG1dz"
    "fSwnGPG9nGDEJ3OCEV/NCUZ8OCcY8e2cYMTnc4KRvpATjPSRnGCk79ixJrdP5QQjfc3i3D6Y"
    "E4z0zZxgpM/mBCN92cbt3D6eE4z0/ZxgJCbkBCOxwsbk3Bji5M4nXX7nk64c55Ms3/dJ91zn"
    "k64+ziddPZ1Puvo7n3Ttcj7p2ut80unB+aTTj/NJpzfnk06fziednp1POv07n3R2cT7p7OV8"
    "0tlR5BEfdnaXciI+7/xEnhvpI86vpJ6RPuX8UNoV6YPOb0UPkT7r/Fz0Funjrl+IniMxwfUj"
    "sUtkLMsJFrn1aUjGOMH+/yxYLOOjYOSZUPmzoMgFi1zuFQz5/+89drR6ny3vtKPVnmBe9R41"
    "j3qvqt8V62sBtccpexJ5VfmypyHvaQuq97f5/6/35fr9rn5/rt8Dy3vhAur9bzFSft6v9+9l"
    "30fyy16QvGcuod4/xzEtSSzvqOOYliaW99hxTMsSy7vuOKblieV9eBzTisTyzjyOaWViea8e"
    "x7Qqsbx7j2NanVjez8cxrUks7/DjmNYmlvf8cUzjieV9bBzTesTyzjaOaQNiea8bx7QRsbz7"
    "jWOaQCzvh+OYNiWWd8hxTO8klvfMcUxbEMu76DimdxHL++o4pq2J5Z12HNNEYnnvHce0DbG8"
    "G49jmkws78/jmLYllnfscUzbEct7+Dim7YnlXX0c047E8j4/jmlnYnnnH8e0K7G8H49jej+x"
    "vI+NY9qdWN7ZxjHtSSzvdeOY9iaWd79xTPsQy/vhOKb9iPup/+GQd8p9uX8s75UHMn2Ae7jy"
    "jnkQ017c35X3zUOY9uB7AHn3PIxpN+7ny3voEUzv4x66/P/Aw0y7cH9d/sdgFNNO3NeW/6t4"
    "hGkH7nnL/1iMZXov9+bl/y3GM72He6byvxcTmXrcT5X/w3iUaZB7rvI/GZOZJnFvWf4/YwrT"
    "u7kvLP+r8STTVtwzlv/bmMa0Jffo5X84ZjBtzv17+X+OWUyb8b2C/G/HHKZN+M5B/s9jHtPG"
    "3HOX//lYwLQh9+Pl/z8WMa3PdxXyvyBLmNblewz5v5BlTOvwXYv8f9IKprW4zy//q5TCtAbf"
    "Rcj/LaUxrcZ3I/I/TOlMq3CPXf6faQ3TStzXl/9tWse0AvfG5f+cNjAtx/dh8j9PmUzL8P2Z"
    "/P/TJqal+F5M/hfqKaZ38L2Z/F9UFtPi3D8vzn4l/6+xVV3LUvdsUWU9pZ6xWT17k6rTRlXX"
    "TNWGDNW2DarN65Uu1ikdrVW6W6N0ulrpOl3ZYJWyTZqyWaqyZYqy8Upl+xXKJ5YrX1mmfGip"
    "8q0lyucWK19cpHx0ofLdBcqn5ytfn6f6wFzVN+aoPjNb9aVZqo/NVH1vhuqT01Vfnab68FTV"
    "t59Uff4JFQumqBjxuIodk1VMeUzFmkdVDJqkYtNEFbMmqFg2XsW4cSr2jVUxcYyKlY+oGDpa"
    "xdZRKuaOVLH4YRWjH1Kxe4SK6cNVrB+mxoChamwYosaMwWosGaTGmAfV2DNQjUkD1FjVn++k"
    "5H9p5tC+2ep/bbKZzieW/8fJZrqQWP5nJ5vpYmL5v55spkuJ5X9/spkuJ5b/D8pmupJY/oco"
    "m2kqsfyfUTbTVcTyv0jZTFcTy/8rZTNdSyz/05TNdD2x/N9TNtMMYvnfgGymG4k3/p+uzva1"
    "yyqM4x5stWTJWsMUGzZE11prrbWWO1s+9FcE0YuIiIiIiIiI/pJedOyNu0l8fmr5rKsxfFjD"
    "ltpaIiISIjKmc3PZvvw+X87BFzefr8fx87f7XNf3Bu9zXRc+k+D3aJ8XSMW5gVScHUjwh+Jd"
    "rPfnXfYrFWfZEnwP7fNuCb6P9pm4BH0uwefmEvwA7bN1CX6I9vm7BD9C+4xegh+jfY4vwU/Q"
    "PuuX4KdonwdM8DO0zwwm+Dna5woT/ALtM3gJfon2ma8Ev0L7XFiCX6N9dizBb9A+X5bgt2if"
    "QUvwO7TfZ5fvk7c/9u63fCfsd8g7uIZYcz/oH4v30UNc2x97zzxUvKP2z+9graLf9E9cO1nb"
    "Se/mCu5Ci7vR4h60uBct7kOL+9HiAbR4EC0eQouH0eIR9BF6YVdwGD1MX+kKHkWLx9DicbR4"
    "Ai2eRIun0OJptHgGLZ5FiyPoEfpfV+6DvSz39x5Fj9IDvIJj6DF6VVfwHFo8jxYvoMWLaHEc"
    "PU5v8QpOoCfoT1vBS2jxD7Q4iRb/dD9yeh1X8Ar6Cr1uK/gXWpxCi3+jxWm054RV8Br6GrWj"
    "FbyOvk5tbgVvoG9Qi1vBm+ib1I5W8Bb6FjW6FfwX7frSCt5G36aOt4J30HeYWVbBu+i7zGGr"
    "oHu6z/B7TlMfPc39mIVT1MNOcf/uw6vMQ7vK/X4ALzPr7TL7swAnqZ+dZD8X4SVmr7lP8SM4"
    "wX+KTRAvqmn+nThS/fg48aW68ovEneroLxCPqoc+T5yq1vwc8asaavdiV336GPGumYHuv646"
    "6VHyQ/XTv5E3mjX5K/mkGvkR8kxzCM+Sf5pPeIa8VC31afJV8wlPkceqvT5Jfqu+/gR5rzrs"
    "4/iB6uuP4ROquz+Kf6i+/hd8RXMRh/Eb1eD/jA9pvuIR/EmzFw/jW6rrPoSfab7iQXxOcxcP"
    "4H+ax7gfX1QN+D78Un0B9uKj6k2xB39V/9Xd+K5mXuzCjzUnxr32N4Ya5d9toUbF30uhRsVj"
    "O7PzFKcvF7P3Opi9p7h+pahf76SuXXnwKvP8lB9doUblzWuhRuVTd1ET/zq18sq/nlCj8vKN"
    "UKPytTfk2vo3izr8vpDrnN8KNcoPNoVcW94favyHa6ZYE/2zoj9D9GeL/jdFfxfR31H0dxf9"
    "O4n+XUXfA9H3RvQ9E30vRd9j0fde9J6I3ivReyh6b0Xv+caQY8Gzsxwrjh338HVsOdZaQ47B"
    "F0OOTc9odew6lltCjvEXQo59zx91bjhX1oScQ6tDzq3nQ84597xwTjpHm0PO3edCzummkHP9"
    "2ZA9oDFkb/BMWnuHveSZkD2mIWTvcT8Je5O96umQPaw+ZG97KmTPezJkL6wL2SOfCNk73ZvD"
    "3mqvDSF78LKQvflR4dn/FV6+WHj8w8L7F4pnwnzxrHhQPEPmimfL/eKZc694Fs0Wzyj3q4js"
    "4Rou7W+Ea9FriYsIW9AtxFGE69DriLsIW9GtxGmE69HriesIN6A3kAcRtqHbyJsI29Ht5FmE"
    "HegO8jLCTnQneRxhF7qLvI+wG92NT0TYg+7BVyLsRffiQxH2ofvwrQg3ocV+dH/I+zPDfkX6"
    "jMyiZ9lf6Xvse2Qe6xx6jjiJ9COZR88TV9ILxJv0Q+JQepH4jMx1fYT2zNZIfAd0IA8iXI5e"
    "Tt5EWIeuI89iyH16IqxH15OvEa5AryC/I2xAN+AHEa5Er8Q/ImxEN+I3ETahm/CnCJvRzfhZ"
    "hKvQq/C/CFejB5auwaXrba7NrG1Zurby5838ndfEbVzvsDaA9vpgsTZQfM5W1rbwmYNc21j7"
    "H3z53OI="
)


def _load_parts():
    raw = zlib.decompress(base64.b64decode(_DATA))
    out, off = [], 0
    for _ in _PARTS:
        nv, nt = struct.unpack_from("<II", raw, off)
        off += 8
        verts = np.frombuffer(raw, np.float32, nv * 3, off).reshape(-1, 3).copy()
        off += nv * 3 * 4
        tris = np.frombuffer(raw, np.uint32, nt * 3, off).reshape(-1, 3).copy()
        off += nt * 3 * 4
        out.append((verts, tris))
    return out


class ClickerChan(Model):
    id = "clicker_chan"
    name = "ｸﾘｯｶｰﾁｬﾝ"
    description = ("ｸﾘｯｶｰﾁｬﾝだよ! ｶﾁｶﾁ!!!!")

    params = {
        "hole_size": Param("穴の大きさ", 14.0, "float", 13.0, 15.0, 0.01, "mm"),
        "stem_thickness": Param("ステムのアーム厚", 1.18, "float", 0.18, 2.18, 0.01, "mm"),
        "heaton_hole": Param("ヒートン下穴", False, "bool"),
        "print_layout": Param("プリント用配置", True, "bool"),
    }

    def build(self, p):
        # 可変フィーチャーを CSG で生成
        # 穴: X-Zは中央基準(可変サイズ)、Yは奥端(HOLE_Y_BACK)固定で足側へ深さぶん伸ばす
        hole = Manifold.cube(
            (p.hole_size, HOLE_DEPTH, p.hole_size)).translate(
            (HOLE_XZ_CENTER[0] - p.hole_size / 2,
             HOLE_Y_BACK - HOLE_DEPTH,
             HOLE_XZ_CENTER[1] - p.hole_size / 2))
        arm_x = Manifold.cube((CROSS_SPAN, CROSS_DEPTH, p.stem_thickness), True)
        arm_z = Manifold.cube((p.stem_thickness, CROSS_DEPTH, CROSS_SPAN), True)
        cross = (arm_x + arm_z).translate(CROSS_CENTER)

        # ヒートン下穴: +Y面から -Y へ深さ3mm。入口を少しだけ外へ出す。
        heaton = (Manifold.cylinder(HEATON_DEPTH + HEATON_OVERSHOOT,
                                    HEATON_DIAM / 2, circular_segments=24)
                  .rotate((90, 0, 0))
                  .translate((HEATON_XZ[0],
                              HEATON_SURFACE_Y + HEATON_OVERSHOOT,
                              HEATON_XZ[1])))

        built = []
        for (verts, tris), (name, color) in zip(_load_parts(), _PARTS):
            m = Manifold(Mesh(vert_properties=verts, tri_verts=tris))
            if name in ("ボディ", "顔"):
                m = m - hole            # 14x14角穴を開ける
            elif name == "足":
                m = m - cross           # 十字穴を開ける
            if name == "ボディ" and p.heaton_hole:
                m = m - heaton          # ヒートン下穴を開ける
            built.append((name, color, m))

        if not p.print_layout:
            z0 = min(m.bounding_box()[2] for _, _, m in built)
            return [Part(n, m.translate((0, 0, -z0)), c) for n, c, m in built]

        # プリント用: 足以外はこの向きのままベッド接地。足は寝かせて右隣へ、
        # 上から見てY位置をボディに揃える。
        main = [(n, c, m) for n, c, m in built if n != "足"]
        foot = next(m for n, _, m in built if n == "足")
        z0 = min(m.bounding_box()[2] for _, _, m in main)
        seated = [(n, c, m.translate((0, 0, -z0))) for n, c, m in main]
        parts = [Part(n, m, c) for n, c, m in seated]
        boxes = [m.bounding_box() for _, _, m in seated]
        main_right = max(b[3] for b in boxes)
        main_cy = (min(b[1] for b in boxes) + max(b[4] for b in boxes)) / 2
        foot = foot.rotate((90, 0, 0))
        fx0, fy0, fz0, _, fy1, _ = foot.bounding_box()
        foot = foot.translate((main_right + 4.0 - fx0,
                               main_cy - (fy0 + fy1) / 2, -fz0))
        parts.append(Part("足", foot, next(c for n, c, _ in built if n == "足")))
        return parts
