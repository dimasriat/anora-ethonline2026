global TREE_DEPTH: u32 = 8;
global SUPPLIERS: u32 = 8;
global BP: u64 = 10_000;

fn hash2(a: Field, b: Field) -> Field {
    std::hash::pedersen_hash([a, b])
}

fn receipt_commitment(secret: Field, receipt_id: Field, quantity_kg: u64) -> Field {
    std::hash::pedersen_hash([secret, receipt_id, quantity_kg as Field])
}

fn merkle_root(leaf: Field, path: [Field; TREE_DEPTH], index: Field) -> Field {
    let bits: [bool; TREE_DEPTH] = index.to_le_bits();
    let mut node = leaf;
    for i in 0..TREE_DEPTH {
        node = if !bits[i] { hash2(node, path[i]) } else { hash2(path[i], node) };
    }
    node
}

fn total_made_tea(intakes: [u64; SUPPLIERS]) -> u64 {
    let mut total: u64 = 0;
    for i in 0..SUPPLIERS {
        total += intakes[i];
    }
    total
}

fn main(
    registry_root: pub Field,
    receipt_key: pub Field,
    mandate_hash: pub Field,
    epoch: pub u64,
    collateral_value_idr: pub u64,
    requested_principal_idr: pub u64,
    policy_ltv_bp: pub u64,
    policy_max_tenor_days: pub u64,
    requested_tenor_days: pub u64,
    secret: Field,
    nullifier_key: Field,
    receipt_id: Field,
    quantity_kg: u64,
    intakes: [u64; SUPPLIERS],
    path: [Field; TREE_DEPTH],
    index: Field,
    mandate_preimage: Field,
) -> pub Field {
    assert(total_made_tea(intakes) == quantity_kg);

    assert(requested_principal_idr * BP <= collateral_value_idr * policy_ltv_bp);

    assert(requested_tenor_days <= policy_max_tenor_days);

    let leaf = receipt_commitment(secret, receipt_id, quantity_kg);
    assert(merkle_root(leaf, path, index) == registry_root);

    assert(std::hash::pedersen_hash([receipt_id]) == receipt_key);

    assert(std::hash::pedersen_hash([mandate_preimage]) == mandate_hash);

    std::hash::pedersen_hash([nullifier_key, receipt_id, epoch as Field])
}

global TEST_SECRET: Field = 0x1a2b3c;
global TEST_NULLIFIER_KEY: Field = 0x4d5e6f;
global TEST_RECEIPT_ID: Field = 0x53524754454824;
global TEST_MANDATE_PREIMAGE: Field = 0x9911aa;
global TEST_INDEX: Field = 5;
global TEST_QUANTITY_KG: u64 = 24_000;
global TEST_INTAKES: [u64; SUPPLIERS] = [3600, 2850, 3300, 2400, 3150, 2700, 3450, 2550];
global TEST_VALUE_IDR: u64 = 600_000_000;
global TEST_PRINCIPAL_IDR: u64 = 420_000_000;
global TEST_LTV_BP: u64 = 7_000;
global TEST_TENOR: u64 = 90;
global TEST_EPOCH: u64 = 1;

fn test_path() -> [Field; TREE_DEPTH] {
    let mut path: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    for i in 0..TREE_DEPTH {
        path[i] = (i as Field) + 100;
    }
    path
}

fn test_root() -> Field {
    let leaf = receipt_commitment(TEST_SECRET, TEST_RECEIPT_ID, TEST_QUANTITY_KG);
    merkle_root(leaf, test_path(), TEST_INDEX)
}

fn run(
    root: Field,
    principal: u64,
    tenor: u64,
    quantity: u64,
    intakes: [u64; SUPPLIERS],
    receipt_key: Field,
) -> Field {
    main(
        root,
        receipt_key,
        std::hash::pedersen_hash([TEST_MANDATE_PREIMAGE]),
        TEST_EPOCH,
        TEST_VALUE_IDR,
        principal,
        TEST_LTV_BP,
        TEST_TENOR,
        tenor,
        TEST_SECRET,
        TEST_NULLIFIER_KEY,
        TEST_RECEIPT_ID,
        quantity,
        intakes,
        test_path(),
        TEST_INDEX,
        TEST_MANDATE_PREIMAGE,
    )
}

fn valid_receipt_key() -> Field {
    std::hash::pedersen_hash([TEST_RECEIPT_ID])
}

#[test]
fn accepts_a_request_at_exactly_the_ltv_limit() {
    let _ = run(test_root(), TEST_PRINCIPAL_IDR, TEST_TENOR, TEST_QUANTITY_KG, TEST_INTAKES, valid_receipt_key());
}

#[test]
fn nullifier_is_stable_for_the_same_receipt_and_round() {
    let a = run(test_root(), TEST_PRINCIPAL_IDR, TEST_TENOR, TEST_QUANTITY_KG, TEST_INTAKES, valid_receipt_key());
    let b = run(test_root(), TEST_PRINCIPAL_IDR - 1, TEST_TENOR, TEST_QUANTITY_KG, TEST_INTAKES, valid_receipt_key());
    assert(a == b);
}

#[test(should_fail)]
fn refuses_a_principal_one_rupiah_over_the_ltv_limit() {
    let _ = run(test_root(), TEST_PRINCIPAL_IDR + 1, TEST_TENOR, TEST_QUANTITY_KG, TEST_INTAKES, valid_receipt_key());
}

#[test(should_fail)]
fn refuses_a_tenor_beyond_policy() {
    let _ = run(test_root(), TEST_PRINCIPAL_IDR, TEST_TENOR + 1, TEST_QUANTITY_KG, TEST_INTAKES, valid_receipt_key());
}

#[test(should_fail)]
fn refuses_intakes_that_do_not_sum_to_the_receipt_quantity() {
    let mut short = TEST_INTAKES;
    short[0] -= 1;
    let _ = run(test_root(), TEST_PRINCIPAL_IDR, TEST_TENOR, TEST_QUANTITY_KG, short, valid_receipt_key());
}

#[test(should_fail)]
fn refuses_a_receipt_that_is_not_in_the_registry() {
    let _ = run(test_root() + 1, TEST_PRINCIPAL_IDR, TEST_TENOR, TEST_QUANTITY_KG, TEST_INTAKES, valid_receipt_key());
}

#[test(should_fail)]
fn refuses_a_proof_bound_to_a_different_receipt_key() {
    let _ = run(test_root(), TEST_PRINCIPAL_IDR, TEST_TENOR, TEST_QUANTITY_KG, TEST_INTAKES, valid_receipt_key() + 1);
}

#[test]
fn print_public_inputs_for_prover_toml() {
    let root = test_root();
    let key = valid_receipt_key();
    let mandate = std::hash::pedersen_hash([TEST_MANDATE_PREIMAGE]);
    println(f"registry_root = {root}");
    println(f"receipt_key = {key}");
    println(f"mandate_hash = {mandate}");
}
