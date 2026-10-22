# 실제 사례와 회귀 자산

초기 37건: mixed role/target 20, S2/S3 충돌 10, 단계/관계 검토 5, raw 없는 미확인 1, raw 발견 alias 오류 1.

- 신동중 13: 수학 기준·입력·scorer·projection이 같은 과거 4.7/T2 성공을 실제 재생했다. 신규 호출 없음.
- 과거 S2 기술적 alias 오류 11: 원래 축·work·의존성을 유지한 정규화만으로 복구했다. S3 대안을 보존했다.
- 언북중 8: 요약에는 raw 부재로 표시됐지만 실제 raw 파일 31,417 bytes가 존재했다. 출처와 요청 binding 확인 후 2.7/T1로 복구했다.
- 같은 점수이나 구조가 다른 4건: 과거 점수로 고르지 않고 새로운 explicit 평가 대상으로 보냈다.
- 새 역할/목표 혼재 평가 대상: 19건. 혼재 20건 중 나머지 1건은 exact historical 성공을 재사용했다.
- 경원중 20: 원시 응답 없음, call_saved 불명 기록 있음. replacement 조건 미충족으로 재호출 없음.

## 추가 채택 전체

| question | 분류 | stage | score | tier | request |
|---|---|---|---|---|---|
| 07b65e53-ca57-428d-aa6f-b8d8ebc3f276 | fresh_medium_rescue | 2 | 4.8 | T2 | abf94e0bdca83d8035218b109f8567dce77b0a39c0589981c7138fe4222f8855 |
| 21b99f49-c95d-45a6-b695-37a4e691e31e | fresh_medium_rescue | 2 | 4.8 | T2 | f9f1ef5278ae8a1a43f4cf9cf0a3f7298fa4c87237c96bd98f580adbcea5b0da |
| 22f22a94-095a-49ab-a8b0-d1286c8f38b3 | fresh_medium_rescue | 2 | 6.9 | T3 | acf12c8d5501e5ab1a5d67e5c52869f9834d791f4367f0316341d024c4a5df3b |
| 359e538b-a315-4332-a435-3af3015c4c7b | fresh_medium_rescue | 2 | 1.4 | T0 | 0057a2de13ac4fb5307538efc8f4c444d95aea37e7115f8c2b5ad1212fcb7eda |
| 48039f42-ac97-4c88-8e61-a1847b26e676 | recovered_exact_historical | 1 | 4.7 | T2 | 71e7d859257554d74362c49cf26325b7c886f6f2e85687045acf5f33fb159ba1 |
| 52b74716-7163-4b14-9185-63b352b46e72 | fresh_medium_rescue | 2 | 9.8 | T5 | b4beb29cc72384d98dcac17f11f75228351c6366679c47efef04a68fa485cad8 |
| 596c9e9f-91f7-42c0-8381-ce812d8352c6 | fresh_medium_rescue | 2 | 4.6 | T2 | a9926ee9bbf71839d95c9150c44fde8f405b712c48deea317819a9a6691ca929 |
| 5c4a7a0e-a64e-4fa8-ade8-116827d6f11a | fresh_medium_rescue | 2 | 1.4 | T0 | be9ec003cd76ceb06843b0c9558a99895b551f304bfadf51803e2795c888ae64 |
| 66e447e7-c26c-4291-a6ca-067c9a7a9446 | fresh_medium_rescue | 2 | 6.9 | T3 | 7a168e18adbd2bc7f23029828b06d5ee73a2915c70c48831c4c3497d7b8d837c |
| 6f3f0f1f-f6cd-4c85-b18d-7a1973aa40a5 | fresh_medium_rescue | 2 | 4.8 | T2 | bbf464740ae692e0f7e3e959a946cf516108d48917444606eed50fc67ab6f864 |
| 704f4161-e026-41f4-9ab2-7988b8c47be1 | fresh_medium_rescue | 2 | 6.9 | T3 | 8bf98d501d947943d1a31fce189247211468b0daff90044f3c40e86157e241b8 |
| 72115fa1-8a47-4c12-aa4b-ec5ee1a3ebcd | fresh_medium_rescue | 2 | 1.4 | T0 | a9c5c80339dcc51378d2b0859d51cd8126cb26de31096577486ff8a8c9838edd |
| 7b03e482-ea52-40d4-958c-26bb3cdc5609 | fresh_medium_rescue | 2 | 4.8 | T2 | 90d1246b943e841d92b3b3342a1ae7cf57a88fce8cf2fc723f4305c68f79fc9a |
| 7f4183a0-720c-41fc-be72-dedcbd0989cc | fresh_medium_rescue | 2 | 4.8 | T2 | 4d1edd99a0a4adabb52d301ddecdd6e4fc64bb0f7680a4111faa7355f022bd15 |
| 830b887f-036c-4aba-85bc-20da7e9498d9 | fresh_medium_rescue | 2 | 2.7 | T1 | d25f4c5f87780b0f863f54328ac0fd90b0fa02c993b1eb24d2ae5918f61e272a |
| 8faca0f0-aea5-473b-a23a-b53de6761b8a | fresh_medium_rescue | 2 | 1.4 | T0 | f50e1df9f3d224679ff70b48f43493914f27f29166ef361194b7e32dd7ce4d4f |
| 94c74a7a-347f-4785-b3b3-2984e946347c | fresh_medium_rescue | 2 | 1.4 | T0 | b30791fe065f27ddee439b1674cf3b83c51704f109fb9165d24d6c422163798a |
| 9bda640f-1a49-48d9-945d-375abdd007be | recovered_stage_authority | 2 | 4.7 | T2 | fe24196dd28c90808b59d04cb3df7218761d05d54983814c5ae0419c9d2aa035 |
| a5958695-97fc-448b-b1df-39b5881ac975 | fresh_medium_rescue | 2 | 1.4 | T0 | ef09e491be7d6e39fa9a5d1f4581b47f14305ac70da2f95cfce982b316403b34 |
| aa06a3c0-77a3-4875-93c3-718233768e5b | fresh_medium_rescue | 2 | 6.9 | T3 | 71820cc78e5c66eeb5d6642971cc8b1e9050ec4ef5d95471d41fce391b45ef85 |
| b2531d57-2258-4987-ba40-96ff4cde8e4b | recovered_stage_authority | 2 | 6.9 | T3 | b350b14d2d7851b297c515d930f55435d6275bd0a49510a0028b62e9c35212a0 |
| bfaee7d1-e712-4171-ac2e-2aeadc2230ae | recovered_stage_authority | 2 | 4.8 | T2 | b01c76004e50b84fd313ee4d81bc8002d03f46d4a2c840401f88514eceb317fd |
| c393583b-9b18-4353-bafd-2ad05413403a | fresh_medium_rescue | 2 | 8.7 | T4 | 2d875157e0d81eae1229f273c697aa2dba2342781f679f4f0bacf4e39f9f655d |
| c94aaf03-bd04-452f-a007-ccf213c75ff4 | recovered_stage_authority | 2 | 6.9 | T3 | 6d32ab31f14045a61e59b1d8da262d760474f86be76cb0e0ed0439004efd8788 |
| d0bffa12-9eff-42b4-95d5-911363afdc75 | fresh_medium_rescue | 2 | 4.7 | T2 | 478b8eb39a607d48a6986ffdc906a9f38835124042758b4c697554d57d694bae |
| d0df7c1c-d741-4803-a556-fe691a1eb6dd | recovered_stage_authority | 2 | 6.9 | T3 | 3d0d5d2834397f0e540b7bbbc4b44a2def406b1043da14686f1ed1b42244e040 |
| d2c07211-e110-4af7-9c05-61eb8eb2a6aa | fresh_medium_rescue | 2 | 4.7 | T2 | 306186116be5b73dd11da9fc6b7eeabfe1cafbe729e2396688a84a83a8c22540 |
| ded43e9c-d77c-4d2c-978b-8af0f66a604a | recovered_stage_authority | 2 | 4.8 | T2 | cd854874136b2a953852afd6e9dd95c2a401a90ce88a9cdb526315a389697ab4 |
| e36441b0-ef79-462e-ba88-d0f4fe1cff4b | recovered_stage_authority | 2 | 8.9 | T4 | 1df643e3c8fd9b72fd2fe3b7cfe49250056e6ad4ca7d29dfe32e827e04e72525 |
| ec18b240-c758-4a7f-8b2c-19c1f494e52f | recovered_stage_authority | 2 | 6.9 | T3 | e8fe424045b84579153b80c6234f67c34f65c3bd2de532186892f0ab364873ac |
| f3de1083-9e1e-4365-8361-f43fbdab93fc | recovered_nonsemantic_alias | 2 | 2.7 | T1 | 38100153096a31588367dcf04ef31a1d572d18516b4c101d1b5698f97282dcee |
| f4d22553-1c7e-498d-b08b-bbc751132c77 | recovered_stage_authority | 2 | 8.8 | T4 | 467a2e810b99dc4d3b3b221cd607432770e76f80ebd109d82a43a063b4553967 |
| f5e48844-d82f-46ba-a807-dcaa9c9ab916 | recovered_stage_authority | 2 | 4.8 | T2 | 002c2028dc062421dccfa1a9eeaa93b6b0066e910e0ccf515525659b2b6d9e8a |
| f961c060-100b-4330-9267-90a6e1455cd2 | fresh_medium_rescue | 2 | 9.8 | T5 | be368311b82fa4a1b554f2e429f454b03cbb0c802e14b317b272e358d61ed1c6 |
| fdf9e866-24c2-4f00-8e73-415a7489706c | recovered_stage_authority | 2 | 4.7 | T2 | e643458a3c89ad091a5198fe59f9c008440f5f980bd80794ce2ef07dec1d6995 |
| fe4575d3-1eaa-4bc5-a0d2-8376e2758e66 | fresh_medium_rescue | 2 | 2.7 | T1 | d56b44a6bbb8800d78da33b50bd462e61f39440b9a46fbed9ea936ad3aa26edc |

## 최종 남은 항목

- 경원중 20 / 268bfa13-3ed9-4652-a1fe-bc1463e65f4e: remaining_unresolved, unresolved_no_raw

negative fixtures는 역사적 원본 37건과 최종 미확정 상태를 보존한다. 복구 후 성공한 문항의 원래 실패 기록도 삭제하지 않는다. formula-only 보기, legacy main, target/conclusion, shared premise 중복/alias, 승인된 신구중 projection, cache registry의 기존 계약은 별도 31개 검사를 통과했다.
