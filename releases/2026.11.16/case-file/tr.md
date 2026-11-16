# Eylül 2026 fon tasfiyeleri: kamuya açık veriler önceden ne gösteriyordu?

*Fon İzi vaka dosyası · yöntem v0*

## Ne oldu

Sermaye Piyasası Kurulu (SPK), 17 Eylül 2026 tarihinde 7 portföy yönetim şirketinin bütün fonlarını TEFAS'ta alım ve satıma kapattı ve bunlardan 131 fonun tasfiyesine karar verdi [SPK Bülten 2026/60, s. 1] [SPK Bülten 2026/61, s. 2–6]. SPK, 28 Ağustos 2026 tarihinde Yatırım Fonlarına İlişkin Rehber'in birçok maddesini değiştirmiş ve Rehber'e yeni maddeler eklemişti [SPK Bülten 2026/54, s. 1].

Fon İzi'nin zaman çizelgesi (`events/2026-timeline.csv`), Şubat 2025 ile Kasım 2026 arasında bu şirketler ve fonları hakkında 31 SPK kararını listeliyor; bunların 11 tanesi belirli paylarla sınırlı işlem yasaklarıdır. Her satır bülten ve sayfa numarasını gösterir.

Bu dosya tek bir soruyu yanıtlıyor: **Tasfiyeden önce kamuya açık veriler bu fonlar hakkında ne gösteriyordu ve aynı işaretler başka fonlarda ne sıklıkla görülüyordu?**

## Ne ölçüldü

Fon İzi, kamuya açık fon verilerini yayımlandıkları anla birlikte saklayan bir arşivdir: TEFAS fon sayfaları, eski TEFAS sayfalarının Internet Archive kopyaları, günlük TEFAS verilerini ve aylık portföy dağılımlarını içeren kamuya açık bir veri seti ve SPK bültenleri. Her kayıt kaynağını, alınma zamanını ve içerik özetini taşır.

Yöntem (`METHOD.md`, sürüm v0, geriye dönük testten önce donduruldu) betimleyici göstergeler tanımlar. Bunların dördü neredeyse her fon için ölçülebildi:

- **return-vs-peers**: Fonun 90 günlük getirisi bütün TEFAS fonları arasında 99. yüzdelik dilimde ya da üstünde.
- **investor-growth**: En az 1.000 yatırımcılı bir fonda yatırımcı sayısı 90 günde en az 5 katına çıkmış.
- **net-inflow**: 90 günde fon büyüklüğü, fonun kendi getirisinin ötesinde, başlangıç değerinin en az 2 katı kadar artmış.
- **repo-borrowing**: Fonun varlık dağılımında repo yoluyla borçlanma, fon değerinin yüzde 5 oranını aşmış.

Her gösterge 3 Ocak 2025 ile 11 Eylül 2026 arasındaki her cuma (89 tarih), yalnızca o tarihte kamuya açık olan verilerle değerlendirildi. Aynı göstergeler, aynı fon türlerinden 1.546 başka fon için de değerlendirildi: karşılaştırma grubu.

**Eşikler sonradan bilinenlerle belirlendi.** Eşikleri seçenler tasfiyeleri biliyordu. Buna karşı güvence karşılaştırma grubudur: başka fonlarda da aynı sıklıkla görülen bir gösterge az şey söyler.

## Sonuçlar

| Gösterge | En az bir kez görüldüğü tasfiye edilen fonlar | En az bir kez görüldüğü diğer fonlar | Kaç kat sık | Verisi olan tasfiye edilen fonlar | Verisi olan diğer fonlar |
|---|---|---|---|---|---|
| return-vs-peers | %44,5 | %4,8 | 9,2 | 128 | 1.514 |
| investor-growth | %13,8 | %5,1 | 2,7 | 130 | 1.518 |
| repo-borrowing | %9,3 | %3,4 | 2,7 | 129 | 1.527 |
| net-inflow | %72,7 | %30,4 | 2,4 | 128 | 1.514 |

- **En belirgin ayrım olağan dışı getiride:** gösterge tasfiye edilen fonların %44,5 kadarında, diğer fonların %4,8 kadarında görüldü.
- **Yatırımcı artışı ve repo borçlanması da ayrışıyor:** yatırımcı artışı tasfiye edilen fonlarda 2,7 kat, repo borçlanması 2,7 kat daha sık görüldü.
- **Net giriş diğer fonların da büyük bir bölümünde görüldü** (%30,4); tek başına az şey söyler.
- **Tasfiye edilen fonların birçoğunda bu işaretlerin hiçbiri yok.** Tasfiye, 7 şirketin para piyasası fonları dahil bütün fonlarını kapsadı.

## Ne kadar önce

Bir gösterge, tasfiyeye kadar her cuma kesintisiz tetiklenmiş kaldıysa "önceden görülmüş" sayıldı. Verinin olmadığı ya da eşiğin altında kalınan tek bir hafta bu seriyi bozar; bu yüzden aşağıdaki süreler temkinlidir.

- 26 tasfiye edilen fonda dört göstergeden en az biri 17 Eylül 2026 tarihine kadar kesintisiz sürdü.
- En uzunu: `PDG` fonunun getiri göstergesi 6 Şubat 2026 tarihinden, yani 223 gün önceden beri.
- `TLY`: repo borçlanması 31 Temmuz 2026 tarihinden (48 gün önce), getiri göstergesi 21 Ağustos 2026 tarihinden (27 gün önce) beri.
- Göstergelere göre ortanca süreler: return-vs-peers 16,5 gün, investor-growth 27, repo-borrowing 48, net-inflow 34.

## Bağlam ve sınırlar

- **Portföy dağılımı ve fon türü burada pek ayrışmıyor.** manager-cluster, verisi olan tasfiye edilen fonların %20,7 kadarında, diğer fonların %15,0 kadarında görüldü; ancak portföy dağılımı yalnızca 29 tasfiye edilen fon için ve yalnızca Ağustos ve Eylül 2026 için vardı. reach-vs-type (çok yatırımcılı nitelikli yatırımcı fonu) %15,4 karşısında %13,2 oranında görüldü.
- **İki gösterge ölçülemedi.** Eylül 2026'dan önce zamana bağlı kamuya açık bir fiili dolaşım serisi yok; Borsa İstanbul'un kullanım koşulları günlük işlem hacminin yeniden kullanılmasına izin vermiyor. free-float-share ve days-to-exit "işaret yok" olarak değil, "veri yetersiz" olarak raporlanır.
- **Kapsam.** TEFAS sayfalarının Internet Archive kopyaları Mart 2026'da bitiyor; Nisan–Eylül 2026 verisi, eski satırları TEFAS'tan sonradan toplanmış kamuya açık veri setinden geliyor.
- **Yalnızca betimleyici.** Bu göstergeler ölçülen büyüklükleri belirtilen eşiklerle karşılaştırır. Niyet ya da davranış hakkında bir şey söylemez ve yatırım tavsiyesi değildir.

## Kaynaklar ve teşekkür

- TEFAS (Takasbank) fon sayfaları; SPK haftalık bültenleri; Internet Archive.
- Günlük TEFAS verileri ve aylık portföy dağılımları: kamuya açık veri seti [sercannnnn/fon-analiz-veri](https://github.com/sercannnnn/fon-analiz-veri), çözümleme için kullanıldı; satırları yeniden yayımlanmaz.
- Yöntem, veri tabloları, şemalar ve kod: [github.com/msc-labss/fon-izi](https://github.com/msc-labss/fon-izi). MSC Labs tarafından sürdürülür.
