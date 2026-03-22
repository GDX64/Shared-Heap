use std::hash::{BuildHasher, Hasher};

pub(crate) struct FastIDHasher {
    state: u64,
}

impl FastIDHasher {
    pub(crate) const fn new() -> Self {
        FastIDHasher { state: 0 }
    }
}

impl BuildHasher for FastIDHasher {
    type Hasher = Self;

    fn build_hasher(&self) -> Self::Hasher {
        FastIDHasher { state: 0 }
    }
}

impl Hasher for FastIDHasher {
    fn finish(&self) -> u64 {
        self.state
    }

    fn write_u64(&mut self, i: u64) {
        self.state = i;
    }

    fn write_u32(&mut self, i: u32) {
        self.state = i as u64;
    }

    fn write(&mut self, _bytes: &[u8]) {
        panic!("FastIDHasher only supports hashing specific integer types");
    }
}
